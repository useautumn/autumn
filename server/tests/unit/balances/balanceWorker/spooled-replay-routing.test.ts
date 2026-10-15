import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import { BALANCE_WORKER_SPOOLED_TRACK_MAX_AGE_MS } from "@autumn/env/balanceWorkerConstants";
import type { MeteringRecord } from "@autumn/kafka";
import type { FullSubject, TrackParams } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import * as claimKey from "@/internal/misc/idempotency/actions/checkIdempotencyKey.js";
import * as releaseKey from "@/internal/misc/idempotency/actions/releaseIdempotencyKey.js";
import { getSqsClient } from "@/queue/initSqs.js";
import { classifyQueuedFailure } from "../../../../../apps/balance-worker/src/consume/settleQueuedFailure.js";
import { openStateStore } from "../../../../../apps/balance-worker/src/state/openStateStore.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";
import { createCustomerFixture } from "./customer-fixture.js";
import { createWorkerFixture, partition, topic } from "./worker-fixture.js";

// A stalled append may still land on the worker's command log. Its SQS copy must reach the same log, whatever the
// routing says at replay time, so the worker's command-id dedupe sees both; Redis cannot see the original.
const appendedByReplay: TrackCommand[][] = [];
const redisTracks: unknown[] = [];

await mockModuleWithRestore(
	"@/external/balanceWorker/getBalanceWorkerClient.js",
	() => ({
		getBalanceWorkerClient: () => ({
			queue: {
				track: async ({ commands }: { commands: TrackCommand[] }) => {
					appendedByReplay.push(commands);
				},
			},
		}),
	}),
);
await mockModuleWithRestore(
	"@/internal/balances/track/v3/runTrackV3.js",
	() => ({
		runTrackV3: async (args: unknown) => {
			redisTracks.push(args);
			return { customer_id: "cus_test", balance: null };
		},
	}),
);

const { runBalanceWorkerAsyncTrack } = await import(
	"@/internal/balances/track/balanceWorker/runBalanceWorkerAsyncTrack.js"
);
const { initializeBalanceWorkerCustomer } = await import(
	"@/internal/balances/balanceWorker/initializeBalanceWorkerCustomer.js"
);
const { runBalanceWorkerCheck } = await import(
	"@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js"
);
const { runQueuedTrack } = await import(
	"@/internal/balances/track/runQueuedTrack.js"
);
const { SpooledTrackTooOldError } = await import(
	"@/internal/balances/track/balanceWorker/spool/spooledTrackReplay.js"
);

const standardQueueUrl =
	"https://sqs.us-east-2.amazonaws.com/123456789012/spooled-replay-routing-test";
const previousStandardQueueUrl = process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL;
process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = standardQueueUrl;
const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;

type SpooledMessage = {
	requestId: string;
	body: TrackParams;
	spooledAt: number;
};
const spooled: SpooledMessage[] = [];
const sqsClient = getSqsClient({ queueUrl: standardQueueUrl });
const originalSend = sqsClient.send.bind(sqsClient);
sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
	const entries = command.input.Entries as {
		Id: string;
		MessageBody: string;
	}[];
	for (const entry of entries) spooled.push(JSON.parse(entry.MessageBody).data);
	return { Successful: entries.map(({ Id }) => ({ Id })) };
}) as SQSClient["send"];

const claimSpy = spyOn(claimKey, "checkIdempotencyKey").mockImplementation(
	async () => undefined,
);
const releaseSpy = spyOn(
	releaseKey,
	"releaseIdempotencyKey",
).mockImplementation(async () => undefined);

afterAll(() => {
	sqsClient.send = originalSend;
	claimSpy.mockRestore();
	releaseSpy.mockRestore();
	if (previousStandardQueueUrl === undefined)
		delete process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL;
	else
		process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = previousStandardQueueUrl;
	if (previousRollout === undefined)
		delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
});

beforeEach(() => {
	appendedByReplay.length = 0;
	redisTracks.length = 0;
});

/** Spools the track through a stalled append and returns what the append carried, to land late, and the SQS copy. */
async function spoolThroughStalledAppend({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: TrackParams;
}) {
	const stalled: TrackCommand[] = [];
	const before = spooled.length;
	await runBalanceWorkerAsyncTrack({
		ctx,
		body,
		client: {
			queue: {
				track: async ({ commands }) => {
					stalled.push(...commands);
					await new Promise(() => undefined);
				},
				reset: async () => undefined,
				updateBalance: async () => undefined,
				evict: async () => undefined,
				finalize: async () => undefined,
			},
		},
	});
	expect(spooled).toHaveLength(before + 1);
	return { stalled, message: spooled[before] as SpooledMessage };
}

/** A worker on the production state backend: no durable receipts, so only `recentCommands` remembers an applied id. */
async function startWorker({
	ctx,
	fullSubject,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
}) {
	const sqliteStore = openStateStore({ databasePath: ":memory:" });
	sqliteStore.initializePartition({ topic, partition, nextOffset: 0n });
	const records: MeteringRecord[] = [];
	const worker = createWorkerFixture({
		stateStore: { ...sqliteStore, readReceipt: () => null },
		records,
		now: ctx.timestamp,
	});
	await initializeBalanceWorkerCustomer({
		ctx,
		fullSubject,
		featureIds: ["messages"],
		commandId: "baseline",
		client: worker.client,
	});
	const usage = async () => {
		const checked = await runBalanceWorkerCheck({
			ctx,
			body: { customer_id: fullSubject.customerId, feature_id: "messages" },
			client: worker.client,
		});
		return checked.balance?.usage ?? 0;
	};
	/** What the command consumer does with a record: decide it, and say how it settled. */
	const consume = async (command: TrackCommand) => {
		try {
			const decided = await worker.processor.decideTrack({ command });
			await decided.waitForCommit();
			return "decided";
		} catch (cause) {
			return classifyQueuedFailure({ cause });
		}
	};
	const trackRecords = () =>
		records.filter((record) => record.command.type === "track").length;
	return { worker, usage, consume, trackRecords };
}

/** What processMessage hands runQueuedTrack: the original request id, a later clock. */
const replay = ({
	ctx,
	message,
}: {
	ctx: AutumnContext;
	message: SpooledMessage;
}) =>
	runQueuedTrack({
		ctx: { ...ctx, id: message.requestId, timestamp: ctx.timestamp + 120_000 },
		body: message.body,
		validateTrackBodyIdempotencyKey: false,
		spooledAt: message.spooledAt,
	});

describe("a spooled track replays onto the worker's command log, never Redis", () => {
	test("the customer moved off the worker after the original landed: the replay is a no-op, not a second deduction", async () => {
		const { ctx, fullSubject } = createCustomerFixture();
		const { worker, usage, consume, trackRecords } = await startWorker({
			ctx,
			fullSubject,
		});
		const before = await usage();
		const body: TrackParams = {
			customer_id: fullSubject.customerId,
			feature_id: "messages",
			value: 4,
		};
		process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
		const { stalled, message } = await spoolThroughStalledAppend({ ctx, body });
		for (const command of stalled)
			expect(await consume(command)).toBe("decided");

		process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";
		await replay({ ctx, message });

		expect(redisTracks).toHaveLength(0);
		expect(appendedByReplay).toEqual([stalled]);
		for (const command of appendedByReplay.flat())
			expect(await consume(command)).toBe("applied");
		expect(await usage()).toBe(before + 4);
		expect(trackRecords()).toBe(1);
		await worker.close();
	});

	test("the replay lands before the late original: the original is the no-op", async () => {
		const { ctx, fullSubject } = createCustomerFixture();
		const { worker, usage, consume, trackRecords } = await startWorker({
			ctx,
			fullSubject,
		});
		const before = await usage();
		const body: TrackParams = {
			customer_id: fullSubject.customerId,
			event_name: "message_sent",
			value: 2,
		};
		ctx.features = ctx.features.map((feature) => ({
			...feature,
			event_names: ["message_sent"],
		}));
		process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
		const { stalled, message } = await spoolThroughStalledAppend({ ctx, body });

		await replay({ ctx, message });
		expect(appendedByReplay).toEqual([stalled]);
		for (const command of appendedByReplay.flat())
			expect(await consume(command)).toBe("decided");
		for (const command of stalled)
			expect(await consume(command)).toBe("applied");

		expect(await usage()).toBe(before + 2);
		expect(trackRecords()).toBe(1);
		await worker.close();
	});

	test("a spool older than the worker's dedup window is refused on either routing", async () => {
		const { ctx, fullSubject } = createCustomerFixture();
		const body: TrackParams = {
			customer_id: fullSubject.customerId,
			feature_id: "messages",
			value: 1,
		};
		process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
		const { message } = await spoolThroughStalledAppend({ ctx, body });
		const stale = {
			...message,
			spooledAt: Date.now() - BALANCE_WORKER_SPOOLED_TRACK_MAX_AGE_MS - 1_000,
		};
		for (const routing of ["true", "false"]) {
			process.env.BALANCE_WORKER_ROLLOUT_ENABLED = routing;
			await expect(replay({ ctx, message: stale })).rejects.toBeInstanceOf(
				SpooledTrackTooOldError,
			);
		}
		expect(appendedByReplay).toHaveLength(0);
		expect(redisTracks).toHaveLength(0);
	});
});
