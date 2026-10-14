import { toBatchTrackEntries } from "@/internal/balances/track/batchTrackEntries.js";
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
import { pinTrackProducerQueueToFifo } from "./trackAsyncQueueTestEnv.js";

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
	let restoreQueueEnv: (() => void) | undefined;

	beforeEach(() => {
		mockState.queueCommands = [];
		restoreQueueEnv = pinTrackProducerQueueToFifo({
			fifoQueueUrl: trackAsyncQueueUrl,
		}).restore;

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
		restoreQueueEnv?.();
		restoreQueueEnv = undefined;
	});

	test("two requests with the same body produce DIFFERENT MessageDeduplicationId values per index (current accepted behavior — client retry duplicates)", async () => {
		await runBatchTrack({
			ctx: buildCtx({ requestId: "req_pin_first" }),
			entries: toBatchTrackEntries({ body }),
		});
		const firstCall = mockState.queueCommands[0];
		mockState.queueCommands = [];

		await runBatchTrack({
			ctx: buildCtx({ requestId: "req_pin_second" }),
			entries: toBatchTrackEntries({ body }),
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

		const overlap = firstDedupIds.filter((id) => secondDedupIds.includes(id));
		expect(overlap).toEqual([]);
	});

	test("within ONE call, MessageDeduplicationId is deterministic per index — protects against AWS SDK auto-retry of the same SendMessageBatch", async () => {
		const ctx = buildCtx({ requestId: "req_pin_stable" });

		await runBatchTrack({ ctx, entries: toBatchTrackEntries({ body: body }) });

		const entries = mockState.queueCommands[0]?.Entries ?? [];
		expect(entries).toHaveLength(body.length);

		for (let index = 0; index < body.length; index += 1) {
			expect(entries[index]?.MessageDeduplicationId).toBe(
				`req_pin_stable-${index}`,
			);
		}

		entries.forEach((entry, index) => {
			expect(entry.MessageDeduplicationId).toBe(`${ctx.id}-${index}`);
		});
	});

	test("MessageGroupId preserves the org, environment, customer, and entity routing prefix", async () => {
		const ctx = buildCtx({ requestId: "req_pin_group" });

		await runBatchTrack({ ctx, entries: toBatchTrackEntries({ body: body }) });

		const entries = mockState.queueCommands[0]?.Entries ?? [];
		expect(entries).toHaveLength(3);

		expect(entries[0]?.MessageGroupId).toStartWith(
			"org_pin:sandbox:cus_pin_a:none",
		);
		expect(entries[1]?.MessageGroupId).toStartWith(
			"org_pin:sandbox:cus_pin_b:ent_pin_1",
		);
		expect(entries[2]?.MessageGroupId).toStartWith(
			"org_pin:sandbox:cus_pin_c:none",
		);
	});
});
