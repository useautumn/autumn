import { afterAll, describe, expect, spyOn, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import type { FullSubject, TrackParams } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initializeBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/initializeBalanceWorkerCustomer.js";
import { runBalanceWorkerCheck } from "@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js";
import { runBalanceWorkerAsyncTrack } from "@/internal/balances/track/balanceWorker/runBalanceWorkerAsyncTrack.js";
import { runBalanceWorkerBatchTrack } from "@/internal/balances/track/balanceWorker/runBalanceWorkerBatchTrack.js";
import { toBatchTrackEntries } from "@/internal/balances/track/batchTrackEntries.js";
import * as claimKey from "@/internal/misc/idempotency/actions/checkIdempotencyKey.js";
import * as releaseKey from "@/internal/misc/idempotency/actions/releaseIdempotencyKey.js";
import { getSqsClient } from "@/queue/initSqs.js";
import { classifyQueuedFailure } from "../../../../../apps/balance-worker/src/consume/settleQueuedFailure.js";
import { openStateStore } from "../../../../../apps/balance-worker/src/state/openStateStore.js";
import { createCustomerFixture } from "./customer-fixture.js";
import { createWorkerFixture, partition, topic } from "./worker-fixture.js";

// The header middleware frees an Idempotency-Key on a 503 RESULT_UNKNOWN, though the append usually landed.
// A retry carrying only that header key must then dedupe on the worker, not apply a second time.
const standardQueueUrl =
	"https://sqs.us-east-2.amazonaws.com/123456789012/header-key-command-id-test";
const previousStandardQueueUrl = process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL;
process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = standardQueueUrl;

const spooled: {
	requestId: string;
	idempotencyKey?: string;
	body: TrackParams;
}[] = [];
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

/** A command-log client that keeps what each append carried. */
const recordingQueue = () => {
	const appended: TrackCommand[][] = [];
	return {
		appended,
		client: {
			queue: {
				track: async ({ commands }: { commands: readonly TrackCommand[] }) => {
					appended.push([...commands]);
				},
				reset: async () => undefined,
				updateBalance: async () => undefined,
				evict: async () => undefined,
				finalize: async () => undefined,
			},
		},
	};
};

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
	const consume = async (command: TrackCommand) => {
		try {
			const decided = await worker.processor.decideTrack({ command });
			await decided.waitForCommit();
			return "decided";
		} catch (cause) {
			return classifyQueuedFailure({ cause });
		}
	};
	return { worker, usage, consume };
}

describe("a retry that carries only the Idempotency-Key header", () => {
	test("dedupes on the worker against the attempt whose 503 hid a landed append", async () => {
		const { ctx, fullSubject } = createCustomerFixture();
		const { worker, usage, consume } = await startWorker({ ctx, fullSubject });
		const before = await usage();
		const body: TrackParams = {
			customer_id: fullSubject.customerId,
			feature_id: "messages",
			value: 4,
		};
		const queue = recordingQueue();

		// The first attempt's append landed; its caller saw a 503 and freed the header key.
		await runBalanceWorkerAsyncTrack({
			ctx: { ...ctx, id: "req_first", idempotencyKey: "client-header-key" },
			body,
			client: queue.client,
		});
		await runBalanceWorkerAsyncTrack({
			ctx: { ...ctx, id: "req_retry", idempotencyKey: "client-header-key" },
			body,
			client: queue.client,
		});

		const [first, retry] = queue.appended;
		for (const command of first ?? [])
			expect(await consume(command)).toBe("decided");
		for (const command of retry ?? [])
			expect(await consume(command)).toBe("applied");
		expect(await usage()).toBe(before + 4);
		await worker.close();
	});

	test("a body key still names the command, so a header and a body key never collide", async () => {
		const { ctx, fullSubject } = createCustomerFixture();
		const queue = recordingQueue();
		await runBalanceWorkerAsyncTrack({
			ctx: { ...ctx, idempotencyKey: "same" },
			body: { customer_id: fullSubject.customerId, feature_id: "messages" },
			client: queue.client,
		});
		await runBalanceWorkerAsyncTrack({
			ctx,
			body: {
				customer_id: fullSubject.customerId,
				feature_id: "messages",
				idempotency_key: "same",
			},
			client: queue.client,
		});
		const [headerKeyed, bodyKeyed] = queue.appended.map(
			(commands) => commands[0]?.commandId,
		);
		expect(headerKeyed).not.toBe(bodyKeyed);
	});

	test("a batch's header key names no item, so identical items stay distinct", async () => {
		const { ctx, fullSubject } = createCustomerFixture();
		const queue = recordingQueue();
		const item = {
			customer_id: fullSubject.customerId,
			feature_id: "messages",
		};
		await runBalanceWorkerBatchTrack({
			ctx: { ...ctx, idempotencyKey: "batch-header-key" },
			entries: toBatchTrackEntries({ body: [item, item] }),
			client: queue.client,
		});
		const commandIds = queue.appended.flat().map(({ commandId }) => commandId);
		expect(new Set(commandIds).size).toBe(2);
	});

	test("a spooled track carries the header key, so its replay rebuilds the same command ids", async () => {
		const { ctx, fullSubject } = createCustomerFixture();
		const stalled: TrackCommand[] = [];
		await runBalanceWorkerAsyncTrack({
			ctx: { ...ctx, idempotencyKey: "client-header-key" },
			body: { customer_id: fullSubject.customerId, feature_id: "messages" },
			client: {
				queue: {
					...recordingQueue().client.queue,
					track: async ({ commands }) => {
						stalled.push(...commands);
						await new Promise(() => undefined);
					},
				},
			},
		});
		const message = spooled.at(-1);
		expect(message?.idempotencyKey).toBe("client-header-key");

		const replay = recordingQueue();
		await runBalanceWorkerAsyncTrack({
			ctx: {
				...ctx,
				id: message?.requestId ?? "",
				idempotencyKey: message?.idempotencyKey,
				timestamp: ctx.timestamp + 120_000,
			},
			body: message?.body as TrackParams,
			client: replay.client,
		});
		expect(replay.appended.flat().map(({ commandId }) => commandId)).toEqual(
			stalled.map(({ commandId }) => commandId),
		);
	});
});
