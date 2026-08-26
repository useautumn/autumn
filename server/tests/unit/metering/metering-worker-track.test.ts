import { describe, expect, test } from "bun:test";
import type { MeteringEvent } from "@/internal/metering/events/meteringEventSchema.js";
import { InMemoryMeteringLog } from "@/internal/metering/log/inMemoryMeteringLog.js";
import type { MeteringLog } from "@/internal/metering/log/meteringLog.js";
import { buildShadowEventId } from "@/internal/metering/shadow/shadowEvent.js";
import { InMemorySnapshotStore } from "@/internal/metering/snapshot/inMemorySnapshotStore.js";
import { createMeteringHttpApp } from "@/internal/metering/worker/meteringHttpApp.js";
import { PartitionWorker } from "@/internal/metering/worker/partitionWorker.js";
import { makeEvent } from "./metering-test-fixtures.js";

const TRACK_BODY = {
	org_id: "org_1",
	env: "sandbox",
	customer_id: "cus_1",
	feature_id: "messages",
	value: 30,
	idempotency_key: "track:req_1",
};

const post = ({
	app,
	body,
}: {
	app: ReturnType<typeof createMeteringHttpApp>;
	body: unknown;
}) =>
	app.request("/track", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

const createWorkerApp = async ({
	seed = [makeEvent({ id: "evt_grant", type: "grant", value: 100 })],
	log = new InMemoryMeteringLog({ partition: 0 }),
}: {
	seed?: MeteringEvent[];
	log?: MeteringLog;
} = {}) => {
	for (const event of seed) await log.append({ event });

	const worker = new PartitionWorker({
		partition: 0,
		log,
		snapshotStore: new InMemorySnapshotStore(),
	});
	await worker.takeOwnership();
	await worker.consume();

	return { app: createMeteringHttpApp({ worker }), worker, log };
};

const balanceOf = ({ worker }: { worker: PartitionWorker }): number =>
	worker.check({ customerId: "cus_1", featureId: "messages" }).balance;

describe("worker POST /track", () => {
	test("deducts against the fold and answers with the new balance", async () => {
		const { app, worker } = await createWorkerApp();

		const response = await post({ app, body: TRACK_BODY });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			balance: 70,
			allowed: true,
			duplicate: false,
		});
		expect(balanceOf({ worker })).toBe(70);
	});

	test("appends the event to the log before answering", async () => {
		const { app, log, worker } = await createWorkerApp();

		await post({ app, body: TRACK_BODY });

		const appended = await log.read({ fromOffset: worker.offset, limit: 10 });
		expect(appended).toHaveLength(1);
		expect(appended[0].event).toMatchObject({
			type: "deduct",
			org_id: "org_1",
			customer_id: "cus_1",
			feature_id: "messages",
			value: 30,
			// Same derivation the API-side shadow tap uses, so a mirrored twin of
			// this write collapses onto the same id.
			id: buildShadowEventId({
				type: "deduct",
				orgId: "org_1",
				env: "sandbox",
				customerId: "cus_1",
				featureId: "messages",
				idempotencyKey: "track:req_1",
			}),
		});
	});

	test("consuming the command's own event does not double count", async () => {
		const { app, worker, log } = await createWorkerApp();
		const offsetBeforeCommand = worker.offset;

		await post({ app, body: TRACK_BODY });
		expect(balanceOf({ worker })).toBe(70);

		// The consumer walks the same offset the command wrote, exactly as it
		// would after the broker echoes it back.
		const { applied } = await worker.consume();

		expect(applied).toBe(1);
		expect(worker.offset).toBe(offsetBeforeCommand + 1);
		// Folded as a duplicate, so the balance is untouched.
		expect(balanceOf({ worker })).toBe(70);
		expect(await log.read({ fromOffset: worker.offset, limit: 10 })).toEqual(
			[],
		);
	});

	test("a repeated idempotency key is reported as a duplicate", async () => {
		const { app, worker } = await createWorkerApp();

		await post({ app, body: TRACK_BODY });
		const replay = await post({ app, body: TRACK_BODY });

		expect(await replay.json()).toEqual({
			balance: 70,
			allowed: true,
			duplicate: true,
		});
		expect(balanceOf({ worker })).toBe(70);
	});

	test("an insufficient balance is rejected without moving the meter", async () => {
		const { app, worker } = await createWorkerApp();

		const response = await post({
			app,
			body: { ...TRACK_BODY, value: 500 },
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			balance: 100,
			allowed: false,
			duplicate: false,
		});
		expect(balanceOf({ worker })).toBe(100);
	});

	test("a rejected deduct still consumes its idempotency key", async () => {
		const { app } = await createWorkerApp();

		await post({ app, body: { ...TRACK_BODY, value: 500 } });
		const replay = await post({ app, body: { ...TRACK_BODY, value: 500 } });

		expect(await replay.json()).toMatchObject({ duplicate: true });
	});

	test("an unusable body is a 400 and never reaches the log", async () => {
		const { app, log, worker } = await createWorkerApp();

		for (const body of [
			{},
			{ ...TRACK_BODY, value: 0 },
			{ ...TRACK_BODY, value: -5 },
			{ ...TRACK_BODY, customer_id: "" },
			{ ...TRACK_BODY, idempotency_key: "" },
		]) {
			expect((await post({ app, body })).status).toBe(400);
		}

		expect(await log.read({ fromOffset: worker.offset, limit: 10 })).toEqual(
			[],
		);
	});

	test("a log that cannot append is a 502, not a silent success", async () => {
		const failingLog: MeteringLog = {
			append: async () => {
				throw new Error("broker down");
			},
			read: async () => [],
		};
		const { app, worker } = await createWorkerApp({
			seed: [],
			log: failingLog,
		});

		const response = await post({ app, body: TRACK_BODY });

		expect(response.status).toBe(502);
		// Nothing was folded, so the caller falling back to Redis is correct.
		expect(balanceOf({ worker })).toBe(0);
	});
});
