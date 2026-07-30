/**
 * TDD contract for routing primary queue sends through SendMessageBatch.
 *
 * Contract under test:
 *   - SQS_QUEUE_URL_V2 sends use SendMessageBatch with up to 10 entries
 *   - mixed job envelopes, FIFO identifiers, and delays are preserved
 *   - partial AWS failures reject only the corresponding addTaskToQueue caller
 *   - explicit dedicated queue overrides continue using SendMessage
 *
 * Pre-implementation red: queueUtils has no primary batcher routing or flush hook.
 * Post-implementation green: primary sends batch while dedicated queues stay unchanged.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { getSqsClient } from "@/queue/initSqs.js";
import { JobName } from "@/queue/JobName.js";
import {
	addTaskToQueue,
	flushPrimarySqsSendBatcher,
} from "@/queue/queueUtils.js";

const PRIMARY_QUEUE_URL =
	"https://sqs.us-east-2.amazonaws.com/123456789012/autumn-prod.fifo";
const DEDICATED_QUEUE_URL =
	"https://sqs.us-east-2.amazonaws.com/123456789012/track-prod.fifo";

const createPayload = ({ index }: { index: number }) => ({
	customerId: `customer_${index}`,
	orgId: "org_1",
	env: AppEnv.Live,
	region: "us-east-2",
	redisInstance: "redis-main",
	timestamp: index,
});

describe("primary queue send batching", () => {
	const originalPrimaryQueueUrl = process.env.SQS_QUEUE_URL_V2;
	let originalPrimarySend: SQSClient["send"];
	let originalDedicatedSend: SQSClient["send"];
	let primaryCommands: Array<{ input: Record<string, unknown> }>;
	let dedicatedCommands: Array<{ input: Record<string, unknown> }>;

	beforeEach(() => {
		process.env.SQS_QUEUE_URL_V2 = PRIMARY_QUEUE_URL;
		primaryCommands = [];
		dedicatedCommands = [];

		const primaryClient = getSqsClient({ queueUrl: PRIMARY_QUEUE_URL });
		const dedicatedClient = getSqsClient({ queueUrl: DEDICATED_QUEUE_URL });
		originalPrimarySend = primaryClient.send.bind(primaryClient);
		originalDedicatedSend = dedicatedClient.send.bind(dedicatedClient);

		primaryClient.send = (async (command: {
			input: {
				Entries?: Array<{ Id: string }>;
			};
		}) => {
			primaryCommands.push(command);
			return {
				Successful: command.input.Entries?.map(({ Id }) => ({ Id })) ?? [],
			};
		}) as typeof primaryClient.send;
		dedicatedClient.send = (async (command: {
			input: Record<string, unknown>;
		}) => {
			dedicatedCommands.push(command);
			return {};
		}) as typeof dedicatedClient.send;
	});

	afterEach(async () => {
		await flushPrimarySqsSendBatcher();
		getSqsClient({ queueUrl: PRIMARY_QUEUE_URL }).send = originalPrimarySend;
		getSqsClient({ queueUrl: DEDICATED_QUEUE_URL }).send =
			originalDedicatedSend;
		process.env.SQS_QUEUE_URL_V2 = originalPrimaryQueueUrl;
	});

	test("sends 10 primary jobs in one SQS batch with their original envelopes", async () => {
		await Promise.all(
			Array.from({ length: 10 }, (_, index) =>
				addTaskToQueue({
					jobName: JobName.SyncCustomerDirty,
					payload: createPayload({ index }),
					messageGroupId: `customer_${index % 2}`,
					messageDeduplicationId: `dedup_${index}`,
				}),
			),
		);

		expect(primaryCommands).toHaveLength(1);
		const entries = primaryCommands[0].input.Entries as Array<{
			Id: string;
			MessageBody: string;
			MessageGroupId: string;
			MessageDeduplicationId: string;
		}>;
		expect(entries).toHaveLength(10);
		expect(entries.map(({ Id }) => Id)).toEqual(
			Array.from({ length: 10 }, (_, index) => index.toString()),
		);
		expect(entries[0]).toMatchObject({
			MessageGroupId: "customer_0",
			MessageDeduplicationId: "dedup_0",
		});
		expect(JSON.parse(entries[0].MessageBody)).toMatchObject({
			id: expect.any(String),
			name: JobName.SyncCustomerDirty,
			data: createPayload({ index: 0 }),
		});
	});

	test("allows different primary queue job types to share a batch", async () => {
		const syncJob = addTaskToQueue({
			jobName: JobName.SyncCustomerDirty,
			payload: createPayload({ index: 0 }),
			messageGroupId: "customer_0",
			messageDeduplicationId: "sync_0",
		});
		const refreshJob = addTaskToQueue({
			jobName: JobName.RefreshEntityAggregate,
			payload: {
				customerId: "customer_1",
				orgId: "org_1",
				env: AppEnv.Live,
				region: "us-east-2",
				internalFeatureIds: ["feature_1"],
			},
			messageGroupId: "customer_1",
			messageDeduplicationId: "refresh_1",
		});

		await flushPrimarySqsSendBatcher();
		await Promise.all([syncJob, refreshJob]);

		const entries = primaryCommands[0].input.Entries as Array<{
			MessageBody: string;
		}>;
		expect(
			entries.map(({ MessageBody }) => JSON.parse(MessageBody).name),
		).toEqual([JobName.SyncCustomerDirty, JobName.RefreshEntityAggregate]);
	});

	test("preserves per-entry delays in a partial primary batch", async () => {
		const queued = addTaskToQueue({
			jobName: JobName.SyncCustomerDirty,
			payload: createPayload({ index: 0 }),
			messageGroupId: "customer_0",
			messageDeduplicationId: "dedup_0",
			delayMs: 2_500,
		});

		await flushPrimarySqsSendBatcher();
		await queued;

		const entries = primaryCommands[0].input.Entries as Array<{
			DelaySeconds?: number;
		}>;
		expect(entries).toHaveLength(1);
		expect(entries[0].DelaySeconds).toBe(2);
	});

	test("rejects only the primary caller whose batch entry failed", async () => {
		const primaryClient = getSqsClient({ queueUrl: PRIMARY_QUEUE_URL });
		primaryClient.send = (async (command: {
			input: {
				Entries: Array<{ Id: string }>;
			};
		}) => {
			primaryCommands.push(command);
			return {
				Successful: [{ Id: "0" }, { Id: "2" }],
				Failed: [{ Id: "1", Code: "Throttled", Message: "entry failed" }],
			};
		}) as typeof primaryClient.send;

		const resultsPromise = Promise.allSettled(
			Array.from({ length: 3 }, (_, index) =>
				addTaskToQueue({
					jobName: JobName.SyncCustomerDirty,
					payload: createPayload({ index }),
					messageGroupId: `customer_${index}`,
					messageDeduplicationId: `dedup_${index}`,
				}),
			),
		);
		await flushPrimarySqsSendBatcher();
		const results = await resultsPromise;

		expect(results.map(({ status }) => status)).toEqual([
			"fulfilled",
			"rejected",
			"fulfilled",
		]);
		expect(results[1]).toMatchObject({
			status: "rejected",
			reason: expect.objectContaining({ message: "entry failed" }),
		});
	});

	test("keeps an explicit dedicated queue override on SendMessage", async () => {
		await addTaskToQueue({
			jobName: JobName.SyncCustomerDirty,
			payload: createPayload({ index: 0 }),
			queueUrl: DEDICATED_QUEUE_URL,
			messageGroupId: "customer_0",
			messageDeduplicationId: "dedup_0",
		});

		expect(dedicatedCommands).toHaveLength(1);
		expect(dedicatedCommands[0].input).toMatchObject({
			QueueUrl: DEDICATED_QUEUE_URL,
			MessageGroupId: "customer_0",
			MessageDeduplicationId: "dedup_0",
		});
		expect(dedicatedCommands[0].input).not.toHaveProperty("Entries");
	});
});
