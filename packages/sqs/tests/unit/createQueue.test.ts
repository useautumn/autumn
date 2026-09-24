import { beforeEach, describe, expect, test } from "bun:test";
import { createConsoleLogger } from "@autumn/logging";
import { AppEnv } from "@autumn/shared";
import {
	SendMessageBatchCommand,
	SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { autoTopupJob } from "../../src/jobs/autoTopup.js";
import type { SqsClient } from "../../src/lib/client/types/sqsClient.js";
import { createQueue } from "../../src/lib/queue/createQueue.js";

type Sent = { kind: "batch" | "single"; entries: Record<string, unknown>[] };
const sent: Sent[] = [];
let failNext = 0;

const fakeClient = ({
	local = false,
}: {
	local?: boolean;
} = {}): SqsClient => ({
	isLocalEndpoint: local,
	close() {},
	client: {
		send: async (command: unknown) => {
			if (failNext > 0) {
				failNext -= 1;
				throw new Error("transport down");
			}
			if (command instanceof SendMessageBatchCommand) {
				const entries = command.input.Entries ?? [];
				sent.push({
					kind: "batch",
					entries: entries as unknown as Record<string, unknown>[],
				});
				return {
					Successful: entries.map((entry) => ({ Id: entry.Id })),
					Failed: [],
				};
			}
			if (command instanceof SendMessageCommand) {
				sent.push({
					kind: "single",
					entries: [command.input as unknown as Record<string, unknown>],
				});
				return {};
			}
			throw new Error("unexpected command");
		},
	} as never,
});

const logger = createConsoleLogger({ level: "error" });
const payload = {
	orgId: "org_1",
	env: AppEnv.Sandbox,
	customerId: "cus_1",
	featureId: "credits",
};
const FIFO_URL = "https://sqs.us-east-2.amazonaws.com/123/autumn.fifo";
const STANDARD_URL =
	"https://sqs.us-east-2.amazonaws.com/123/autumn-track-async";

beforeEach(() => {
	sent.length = 0;
	failNext = 0;
});

describe("createQueue", () => {
	test("a FIFO send carries group and dedupe ids; a standard send carries neither", async () => {
		const fifo = createQueue({
			ctx: { client: fakeClient(), logger },
			config: { url: FIFO_URL, batch: false },
			jobs: [autoTopupJob],
		});
		await fifo.send({ job: autoTopupJob, payload });
		expect(sent[0]?.entries[0]).toMatchObject({
			QueueUrl: FIFO_URL,
			MessageGroupId: expect.stringMatching(/^msg_/),
			MessageDeduplicationId: expect.any(String),
		});
		expect(
			JSON.parse(sent[0]?.entries[0]?.MessageBody as string),
		).toMatchObject({ name: "auto-top-up", data: payload });

		sent.length = 0;
		const standard = createQueue({
			ctx: { client: fakeClient(), logger },
			config: { url: STANDARD_URL, batch: false },
			jobs: [autoTopupJob],
		});
		await standard.send({ job: autoTopupJob, payload });
		expect(sent[0]?.entries[0]).not.toHaveProperty("MessageGroupId");
	});

	test("delay is sent in seconds and capped at 900", async () => {
		const queue = createQueue({
			ctx: { client: fakeClient(), logger },
			config: { url: STANDARD_URL, batch: false },
			jobs: [autoTopupJob],
		});
		await queue.send({
			job: autoTopupJob,
			payload,
			options: { delayMs: 2_500 },
		});
		await queue.send({
			job: autoTopupJob,
			payload,
			options: { delayMs: 3_600_000 },
		});
		expect(sent.map((call) => call.entries[0]?.DelaySeconds)).toEqual([2, 900]);
	});

	test("batched sends share one SendMessageBatch and each caller resolves", async () => {
		const queue = createQueue({
			ctx: { client: fakeClient(), logger },
			config: { url: FIFO_URL },
			jobs: [autoTopupJob],
		});
		await Promise.all(
			[1, 2, 3].map(() => queue.send({ job: autoTopupJob, payload })),
		);
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({ kind: "batch" });
		expect(sent[0]?.entries).toHaveLength(3);
	});

	test("an emulator sends one message at a time even when batching", async () => {
		const queue = createQueue({
			ctx: { client: fakeClient({ local: true }), logger },
			config: { url: "http://localhost:4566/123/autumn.fifo" },
			jobs: [autoTopupJob],
		});
		await Promise.all(
			[1, 2].map(() => queue.send({ job: autoTopupJob, payload })),
		);
		expect(sent.map((call) => call.kind)).toEqual(["single", "single"]);
	});

	test("send retries once alone after a transport error, then throws", async () => {
		const queue = createQueue({
			ctx: { client: fakeClient(), logger },
			config: { url: STANDARD_URL, batch: false },
			jobs: [autoTopupJob],
		});
		failNext = 1;
		await queue.send({ job: autoTopupJob, payload });
		expect(sent).toHaveLength(1);

		failNext = 2;
		await expect(queue.send({ job: autoTopupJob, payload })).rejects.toThrow(
			"transport down",
		);
	});

	test("trySend never throws and reports the failure", async () => {
		const queue = createQueue({
			ctx: { client: fakeClient(), logger },
			config: { url: STANDARD_URL, batch: false },
			jobs: [autoTopupJob],
		});
		failNext = 2;
		expect(await queue.trySend({ job: autoTopupJob, payload })).toMatchObject({
			sent: false,
		});
		expect(await queue.trySend({ job: autoTopupJob, payload })).toEqual({
			sent: true,
		});
	});

	test("shutdown flushes what is batched and refuses later sends", async () => {
		const queue = createQueue({
			ctx: { client: fakeClient(), logger },
			config: {
				url: FIFO_URL,
				batch: { windowMs: 10_000, maxEntries: 10, maxBodyBytes: 1024 * 1024 },
			},
			jobs: [autoTopupJob],
		});
		const pending = queue.send({ job: autoTopupJob, payload });
		await queue.shutdown();
		await pending;
		expect(sent).toHaveLength(1);
		expect(await queue.trySend({ job: autoTopupJob, payload })).toMatchObject({
			sent: false,
		});
	});
});
