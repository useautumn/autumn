import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { SendMessageBatchCommand } from "@aws-sdk/client-sqs";

const realInitSqs = await import("@/queue/initSqs.js");

const sentCommandNames: string[] = [];

const stubSqsClient = {
	send: async (command: unknown) => {
		sentCommandNames.push(command?.constructor.name ?? "unknown");
		if (!(command instanceof SendMessageBatchCommand))
			return { MessageId: "m" };
		return {
			Successful: (command.input.Entries ?? []).map(({ Id }) => ({ Id })),
		};
	},
};

mock.module("@/queue/initSqs.js", () => ({
	...realInitSqs,
	getSqsClient: () => stubSqsClient,
}));

const { addTasksToQueueBatch } = await import("@/queue/queueUtils.js");

afterAll(() => {
	mock.module("@/queue/initSqs.js", () => realInitSqs);
});

beforeEach(() => {
	sentCommandNames.length = 0;
});

const sendThreeTasks = ({ queueUrl }: { queueUrl: string }) =>
	addTasksToQueueBatch({
		jobName: "test-job",
		queueUrl,
		entries: Array.from({ length: 3 }, (_, index) => ({
			payload: { index },
			messageGroupId: `group-${index}`,
			messageDeduplicationId: `dedup-${index}`,
		})),
	});

/**
 * goaws returns SendMessageBatch results under a key the AWS JSON protocol drops, so batched
 * sends looked entirely unsent locally and rejected every caller.
 */
describe("SQS send path selection", () => {
	test("sends individually against a local emulator", async () => {
		const result = await sendThreeTasks({
			queueUrl: "http://localhost:9324/000000000000/autumn.fifo",
		});

		expect(sentCommandNames).toEqual([
			"SendMessageCommand",
			"SendMessageCommand",
			"SendMessageCommand",
		]);
		expect(result).toEqual({ successCount: 3, failures: [] });
	});

	test("batches against real SQS", async () => {
		const result = await sendThreeTasks({
			queueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/autumn.fifo",
		});

		expect(sentCommandNames).toEqual(["SendMessageBatchCommand"]);
		expect(result).toEqual({ successCount: 3, failures: [] });
	});
});
