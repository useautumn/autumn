import { afterAll, describe, expect, spyOn, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import type { MeteringRecord } from "@autumn/kafka";
import { ErrCode, type FullSubject, type TrackParams } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initializeBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/initializeBalanceWorkerCustomer.js";
import { runBalanceWorkerCheck } from "@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js";
import { runBalanceWorkerAsyncTrack } from "@/internal/balances/track/balanceWorker/runBalanceWorkerAsyncTrack.js";
import { runBalanceWorkerTrack } from "@/internal/balances/track/balanceWorker/runBalanceWorkerTrack.js";
import type { TokenDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import * as claimKey from "@/internal/misc/idempotency/actions/checkIdempotencyKey.js";
import * as releaseKey from "@/internal/misc/idempotency/actions/releaseIdempotencyKey.js";
import { getSqsClient } from "@/queue/initSqs.js";
import { classifyQueuedFailure } from "../../../../../apps/balance-worker/src/consume/settleQueuedFailure.js";
import { openStateStore } from "../../../../../apps/balance-worker/src/state/openStateStore.js";
import { createCustomerFixture } from "./customer-fixture.js";
import { createWorkerFixture, partition, topic } from "./worker-fixture.js";

// A spooled track can land twice: the stalled append arrives late on the command log, and SQS replays it through
// runQueuedTrack. Only the worker's command-id dedupe stands between them.
const standardQueueUrl =
	"https://sqs.us-east-2.amazonaws.com/123456789012/track-spool-replay-test";
const previousStandardQueueUrl = process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL;
process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = standardQueueUrl;

type SpooledMessage = {
	requestId: string;
	body: TrackParams;
	tokens?: TokenDeduction;
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
});

/** Spools the track through a stalled append and returns what the append carried, to land late, and the SQS copy. */
async function spoolThroughStalledAppend({
	ctx,
	body,
	tokens,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	tokens?: TokenDeduction;
}) {
	const stalled: TrackCommand[] = [];
	const before = spooled.length;
	await runBalanceWorkerAsyncTrack({
		ctx,
		body,
		tokens,
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

/** The context processMessage builds for the replay: the original request id, a later clock. */
const replayContextOf = ({
	ctx,
	message,
}: {
	ctx: AutumnContext;
	message: SpooledMessage;
}): AutumnContext => ({
	...ctx,
	id: message.requestId,
	timestamp: ctx.timestamp + 120_000,
});

/** A worker on the production state backend: no durable receipts, so only `recentCommands` remembers an applied id. */
async function startWorker({
	ctx,
	fullSubject,
	recentCommandsClock,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	recentCommandsClock?: () => number;
}) {
	const sqliteStore = openStateStore({ databasePath: ":memory:" });
	sqliteStore.initializePartition({ topic, partition, nextOffset: 0n });
	const records: MeteringRecord[] = [];
	const worker = createWorkerFixture({
		stateStore: { ...sqliteStore, readReceipt: () => null },
		records,
		now: ctx.timestamp,
		recentCommandsClock,
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
		return checked.balance?.usage;
	};
	const trackRecords = () =>
		records.filter((record) => record.command.type === "track").length;
	return { worker, usage, trackRecords };
}

describe("a spooled track applies exactly once on the worker", () => {
	test("the late original lands first; the SQS replay is answered as already applied", async () => {
		const { ctx, fullSubject } = createCustomerFixture();
		const { worker, usage, trackRecords } = await startWorker({
			ctx,
			fullSubject,
		});
		const before = await usage();
		const body: TrackParams = {
			customer_id: fullSubject.customerId,
			feature_id: "messages",
			value: 4,
		};

		const { stalled, message } = await spoolThroughStalledAppend({ ctx, body });
		for (const command of stalled) {
			const decided = await worker.processor.decideTrack({ command });
			await decided.waitForCommit();
		}
		await expect(
			runBalanceWorkerTrack({
				ctx: replayContextOf({ ctx, message }),
				body: message.body,
				tokens: message.tokens,
				validateTrackBodyIdempotencyKey: false,
				client: worker.client,
			}),
		).rejects.toMatchObject({ code: ErrCode.DuplicateIdempotencyKey });

		expect(await usage()).toBe((before ?? 0) + 4);
		expect(trackRecords()).toBe(1);
		await worker.close();
	});

	test("the SQS replay lands first; the late original is consumed as already applied", async () => {
		const { ctx, fullSubject } = createCustomerFixture();
		const { worker, usage, trackRecords } = await startWorker({
			ctx,
			fullSubject,
		});
		const before = await usage();
		const body: TrackParams = {
			customer_id: fullSubject.customerId,
			feature_id: "messages",
			value: 4,
			idempotency_key: "client-key",
		};

		const { stalled, message } = await spoolThroughStalledAppend({ ctx, body });
		await runBalanceWorkerTrack({
			ctx: replayContextOf({ ctx, message }),
			body: message.body,
			tokens: message.tokens,
			validateTrackBodyIdempotencyKey: false,
			client: worker.client,
		});
		const lateOriginal = await worker.processor
			.decideTrack({ command: stalled[0] as TrackCommand })
			.then(
				() => "decided",
				(cause: unknown) => classifyQueuedFailure({ cause }),
			);

		expect(lateOriginal).toBe("applied");
		expect(await usage()).toBe((before ?? 0) + 4);
		expect(trackRecords()).toBe(1);
		await worker.close();
	});
});

describe("the worker's command-id dedupe is an in-memory window", () => {
	test("a replay later than two windows after the original would deduct again, so old spools are refused", async () => {
		const { ctx, fullSubject } = createCustomerFixture();
		let workerClock = 0;
		const { worker, usage, trackRecords } = await startWorker({
			ctx,
			fullSubject,
			recentCommandsClock: () => workerClock,
		});
		const before = await usage();
		const body: TrackParams = {
			customer_id: fullSubject.customerId,
			feature_id: "messages",
			value: 4,
		};

		const { stalled, message } = await spoolThroughStalledAppend({ ctx, body });
		const decided = await worker.processor.decideTrack({
			command: stalled[0] as TrackCommand,
		});
		await decided.waitForCommit();
		workerClock = 2 * 600_000;
		await runBalanceWorkerTrack({
			ctx: replayContextOf({ ctx, message }),
			body: message.body,
			tokens: message.tokens,
			validateTrackBodyIdempotencyKey: false,
			client: worker.client,
		});

		expect(await usage()).toBe((before ?? 0) + 8);
		expect(trackRecords()).toBe(2);
		await worker.close();
	});
});

describe("the replay rebuilds the append's commands exactly", () => {
	/** Answers every command as already applied, keeping what it was sent. */
	const duplicateAnsweringClient = () => {
		const sent: TrackCommand[] = [];
		return {
			sent,
			client: {
				track: async ({ command }: { command: TrackCommand }) => {
					sent.push(command);
					throw new BalanceWorkerClientError({
						code: "WORKER_ERROR",
						workerCode: "DUPLICATE_COMMAND",
						outcome: "unknown",
						message: "Command id already applied",
					});
				},
			},
		};
	};

	const cases: { name: string; body: TrackParams; tokens?: TokenDeduction }[] =
		[
			{
				name: "a keyless track",
				body: { customer_id: "cus_test", feature_id: "messages", value: 2 },
			},
			{
				name: "a keyed track with properties and a client timestamp",
				body: {
					customer_id: "cus_test",
					entity_id: "ent_1",
					feature_id: "messages",
					value: 1.5,
					idempotency_key: "k",
					properties: { model: "m", nested: { a: 1 } },
					timestamp: 1_789_999_000_000,
					overage_behavior: "reject",
				},
			},
			{
				name: "a track_tokens track",
				body: { customer_id: "cus_test", feature_id: "messages", value: 3.25 },
				tokens: {
					usage: { modelName: "m", inputTokens: 10, outputTokens: 5 },
					cost: 3.25,
				},
			},
			{
				name: "an event-name fan-out",
				body: { customer_id: "cus_test", event_name: "message_sent", value: 1 },
			},
		];

	for (const { name, body, tokens } of cases)
		test(name, async () => {
			const { ctx, feature } = createCustomerFixture();
			ctx.features = [
				{ ...feature, event_names: ["message_sent"] },
				{
					...feature,
					id: "messages_audit",
					internal_id: "messages_audit_internal",
					event_names: ["message_sent"],
				},
			];
			const { stalled, message } = await spoolThroughStalledAppend({
				ctx,
				body,
				tokens,
			});
			const replay = duplicateAnsweringClient();
			await expect(
				runBalanceWorkerTrack({
					ctx: replayContextOf({ ctx, message }),
					body: message.body,
					tokens: message.tokens,
					validateTrackBodyIdempotencyKey: false,
					client: replay.client,
				}),
			).rejects.toMatchObject({ code: ErrCode.DuplicateIdempotencyKey });
			expect(replay.sent).toEqual(stalled);
		});
});
