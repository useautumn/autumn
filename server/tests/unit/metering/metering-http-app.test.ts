import { beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";
import { InMemoryMeteringLog } from "@/internal/metering/log/inMemoryMeteringLog.js";
import { InMemorySnapshotStore } from "@/internal/metering/snapshot/inMemorySnapshotStore.js";
import { createMeteringHttpApp } from "@/internal/metering/worker/meteringHttpApp.js";
import { PartitionWorker } from "@/internal/metering/worker/partitionWorker.js";
import { makeEvent } from "./metering-test-fixtures.js";

let app: Hono;

beforeAll(async () => {
	const log = new InMemoryMeteringLog({ partition: 0 });
	for (const event of [
		makeEvent({ id: "evt_1", type: "grant", value: 100 }),
		makeEvent({ id: "evt_2", type: "deduct", value: 40 }),
		makeEvent({ id: "evt_3", type: "grant", value: 5, featureId: "credits" }),
		makeEvent({ id: "evt_4", type: "deduct", value: 5, featureId: "credits" }),
	]) {
		await log.append({ event });
	}

	const worker = new PartitionWorker({
		partition: 0,
		log,
		snapshotStore: new InMemorySnapshotStore(),
	});
	await worker.takeOwnership();
	await worker.captureHighWatermark();
	await worker.consume();

	app = createMeteringHttpApp({ worker });
});

describe("metering http app", () => {
	test("GET /healthz reports the consumed offset and the owned epoch", async () => {
		const response = await app.request("/healthz");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: "ok",
			offset: 4,
			epoch: 1,
		});
	});

	test("GET /check serves the in-memory balance", async () => {
		const response = await app.request(
			"/check?org_id=org_1&env=sandbox&customer_id=cus_1&feature_id=messages",
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ balance: 60, allowed: true });
	});

	test("GET /check reports a drained feature as not allowed", async () => {
		const response = await app.request(
			"/check?org_id=org_1&env=sandbox&customer_id=cus_1&feature_id=credits",
		);

		expect(await response.json()).toEqual({ balance: 0, allowed: false });
	});

	test("GET /check on an unknown customer or feature returns zero", async () => {
		const unknownCustomer = await app.request(
			"/check?org_id=org_1&env=sandbox&customer_id=cus_missing&feature_id=messages",
		);
		const unknownFeature = await app.request(
			"/check?org_id=org_1&env=sandbox&customer_id=cus_1&feature_id=missing",
		);

		expect(unknownCustomer.status).toBe(200);
		expect(await unknownCustomer.json()).toEqual({
			balance: 0,
			allowed: false,
		});
		expect(await unknownFeature.json()).toEqual({ balance: 0, allowed: false });
	});

	test("GET /check without the required query params is a 400", async () => {
		const response = await app.request(
			"/check?org_id=org_1&env=sandbox&customer_id=cus_1",
		);

		expect(response.status).toBe(400);
	});

	test("health and reads stay unavailable until the startup watermark is folded", async () => {
		const log = new InMemoryMeteringLog({ partition: 0 });
		await log.append({
			event: makeEvent({ id: "evt_catchup", type: "grant", value: 25 }),
		});
		const worker = new PartitionWorker({
			partition: 0,
			log,
			snapshotStore: new InMemorySnapshotStore(),
		});
		await worker.takeOwnership();
		await worker.captureHighWatermark();
		const catchingUpApp = createMeteringHttpApp({ worker });

		expect((await catchingUpApp.request("/healthz")).status).toBe(503);
		expect(
			(
				await catchingUpApp.request(
					"/check?org_id=org_1&env=sandbox&customer_id=cus_1&feature_id=messages",
				)
			).status,
		).toBe(503);
		expect(
			(
				await catchingUpApp.request("/track", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						org_id: "org_1",
						env: "sandbox",
						customer_id: "cus_1",
						feature_id: "messages",
						value: 1,
						idempotency_key: "before_ready",
					}),
				})
			).status,
		).toBe(503);

		await worker.consume();
		expect((await catchingUpApp.request("/healthz")).status).toBe(200);
	});

	test("POST /catch-up pins a fresh high watermark for post-traffic verification", async () => {
		const log = new InMemoryMeteringLog({ partition: 0 });
		const worker = new PartitionWorker({
			partition: 0,
			log,
			snapshotStore: new InMemorySnapshotStore(),
		});
		await worker.takeOwnership();
		await worker.captureHighWatermark();
		const catchUpApp = createMeteringHttpApp({ worker });

		expect((await catchUpApp.request("/healthz")).status).toBe(200);
		await log.append({
			event: makeEvent({ id: "evt_after_startup", type: "grant", value: 25 }),
		});

		const barrier = await catchUpApp.request("/catch-up", { method: "POST" });
		expect(barrier.status).toBe(202);
		expect(await barrier.json()).toMatchObject({
			status: "catching_up",
			target_offset: 1,
		});
		expect((await catchUpApp.request("/healthz")).status).toBe(503);

		await worker.consume();
		expect((await catchUpApp.request("/healthz")).status).toBe(200);
	});

	test("an unknown route is a 404", async () => {
		expect((await app.request("/nope")).status).toBe(404);
	});
});
