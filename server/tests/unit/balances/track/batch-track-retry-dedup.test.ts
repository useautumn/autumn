/**
 * Regression pin for cubic-dev-ai P1 (confidence 8/10) on the batch
 * async-track work. NOT a fix-and-green test — this asserts the CURRENT
 * accepted behavior and is expected to start and stay green.
 *
 * Cubic P1 (verbatim):
 *   "Using request-scoped IDs for messageDeduplicationId breaks dedup
 *   across retried partial failures, allowing duplicate track jobs."
 *
 * The dedup ID is derived as `${ctx.id}-${index}` where ctx.id is the
 * per-request ID. Two distinct HTTP requests carrying the same batch body
 * therefore generate two distinct sets of MessageDeduplicationId values,
 * so a client-driven retry of a request whose 202 was lost in transit
 * will re-enqueue every item.
 *
 * Why we accepted this trade-off (do NOT undo this pin without addressing
 * all three points):
 *
 * 1. Matches existing single-track behavior. See `addTaskToQueue` in
 *    server/src/queue/queueUtils.ts: the single-track path derives its
 *    dedup ID from a freshly generated random `generateId("dedup")`, also
 *    with no client-supplied idempotency token. Client retries on the
 *    single-track path have the same duplication risk when the client does
 *    not supply an idempotency key. Pinning no-key batch behavior here keeps
 *    the two no-key paths consistent.
 *
 * 2. Same-request retries ARE protected. The purpose `${ctx.id}-${index}`
 *    actually serves is collapsing AWS SDK auto-retries inside a single
 *    SendMessageBatch call. That ID is stable across those SDK-internal
 *    retries, so if AWS returns a 500 and the SDK retries the call, no
 *    duplicate is enqueued.
 *
 * 3. Client-supplied per-item idempotency_key is handled by Redis replay,
 *    not SQS deduplication. This pin covers queue dedup fallback behavior.
 *
 * If this test starts failing:
 *   DO NOT "fix" it by undoing the pin. The fallback behavior for items
 *   without idempotency keys is intentional.
 *
 * Layer (declared in the handoff, not re-derived):
 *   Symptom surfaces in: server/src/internal/balances/track/runBatchTrack.ts:entries.map
 *   Root cause lives in: the API contract — idempotency key is optional
 *   Fix layer: declined — no-key fallback behavior is intentional
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	type BatchTrackParams,
} from "@autumn/shared";
import type { SendMessageBatchCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runBatchTrack } from "@/internal/balances/track/runBatchTrack.js";
import { getSqsClient } from "@/queue/initSqs.js";

type BatchEntry = {
	Id?: string;
	MessageBody?: string;
	MessageGroupId?: string;
	MessageDeduplicationId?: string;
};

type BatchCommandInput = {
	QueueUrl?: string;
	Entries?: BatchEntry[];
};

const trackAsyncQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-async-dev.fifo";

const mockState = {
	queueCommands: [] as BatchCommandInput[],
	originalSend: null as null | SQSClient["send"],
};

const buildCtx = ({ requestId }: { requestId: string }) =>
	({
		id: requestId,
		org: { id: "org_pin" },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		features: [
			{
				id: "messages",
				event_names: ["message.sent"],
			},
		],
		extraLogs: {},
		logger: {
			warn: mock(() => {}),
			error: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const body: BatchTrackParams = [
	{
		customer_id: "cus_pin_a",
		feature_id: "messages",
		value: 1,
	},
	{
		customer_id: "cus_pin_b",
		entity_id: "ent_pin_1",
		feature_id: "messages",
		value: 2,
	},
	{
		customer_id: "cus_pin_c",
		feature_id: "messages",
		value: 3,
	},
];

describe("runBatchTrack — retry-dedup regression pin (cubic P1)", () => {
	const originalEnv = process.env.TRACK_ASYNC_SQS_QUEUE_URL;

	beforeEach(() => {
		mockState.queueCommands = [];
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = trackAsyncQueueUrl;

		const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
		mockState.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: SendMessageBatchCommand) => {
			const input = command.input as BatchCommandInput;
			mockState.queueCommands.push(input);
			const successful = (input.Entries ?? []).map((entry) => ({
				Id: entry.Id,
			}));
			return { Successful: successful };
		}) as typeof sqsClient.send;
	});

	afterEach(() => {
		if (mockState.originalSend) {
			const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
			sqsClient.send = mockState.originalSend as typeof sqsClient.send;
		}
		process.env.TRACK_ASYNC_SQS_QUEUE_URL = originalEnv;
	});

	test("two requests with the same body produce DIFFERENT MessageDeduplicationId values per index (current accepted behavior — client retry duplicates)", async () => {
		await runBatchTrack({ ctx: buildCtx({ requestId: "req_pin_first" }), body });
		const firstCall = mockState.queueCommands[0];
		mockState.queueCommands = [];

		await runBatchTrack({
			ctx: buildCtx({ requestId: "req_pin_second" }),
			body,
		});
		const secondCall = mockState.queueCommands[0];

		expect(firstCall?.Entries).toHaveLength(body.length);
		expect(secondCall?.Entries).toHaveLength(body.length);

		const firstDedupIds = (firstCall?.Entries ?? []).map(
			(entry) => entry.MessageDeduplicationId,
		);
		const secondDedupIds = (secondCall?.Entries ?? []).map(
			(entry) => entry.MessageDeduplicationId,
		);

		expect(firstDedupIds).toEqual([
			"req_pin_first-0",
			"req_pin_first-1",
			"req_pin_first-2",
		]);
		expect(secondDedupIds).toEqual([
			"req_pin_second-0",
			"req_pin_second-1",
			"req_pin_second-2",
		]);

		// The defining symptom of the pinned trade-off: same body, two requests,
		// zero overlap in dedup IDs. SQS would enqueue both sets.
		const overlap = firstDedupIds.filter((id) => secondDedupIds.includes(id));
		expect(overlap).toEqual([]);
	});

	test("within ONE call, MessageDeduplicationId is deterministic per index — protects against AWS SDK auto-retry of the same SendMessageBatch", async () => {
		const ctx = buildCtx({ requestId: "req_pin_stable" });

		await runBatchTrack({ ctx, body });

		const entries = mockState.queueCommands[0]?.Entries ?? [];
		expect(entries).toHaveLength(body.length);

		for (let index = 0; index < body.length; index += 1) {
			expect(entries[index]?.MessageDeduplicationId).toBe(
				`req_pin_stable-${index}`,
			);
		}

		// Pin the derivation formula itself, not just the literal values: if a
		// refactor changes the format, this assertion is the single line that
		// describes the contract the SDK auto-retry guard depends on.
		entries.forEach((entry, index) => {
			expect(entry.MessageDeduplicationId).toBe(`${ctx.id}-${index}`);
		});
	});

	test("MessageGroupId is `${orgId}:${env}:${customerId}:${entityId ?? 'none'}` for each item", async () => {
		const ctx = buildCtx({ requestId: "req_pin_group" });

		await runBatchTrack({ ctx, body });

		const entries = mockState.queueCommands[0]?.Entries ?? [];
		expect(entries).toHaveLength(3);

		expect(entries[0]?.MessageGroupId).toBe("org_pin:sandbox:cus_pin_a:none");
		expect(entries[1]?.MessageGroupId).toBe(
			"org_pin:sandbox:cus_pin_b:ent_pin_1",
		);
		expect(entries[2]?.MessageGroupId).toBe("org_pin:sandbox:cus_pin_c:none");
	});
});
