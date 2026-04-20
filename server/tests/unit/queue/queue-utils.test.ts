import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, AppEnv } from "@autumn/shared";

const mockState = {
	commands: [] as Record<string, unknown>[],
};

mock.module("@/queue/initSqs.js", () => ({
	QUEUE_URL: "https://sqs.eu-west-1.amazonaws.com/123456789012/primary.fifo",
	getSqsClient: () => ({
		send: async (command: { input: Record<string, unknown> }) => {
			mockState.commands.push(command.input);
		},
	}),
}));

import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";

describe("addTaskToQueue queue override", () => {
	const originalSqsQueueUrl = process.env.SQS_QUEUE_URL;
	const originalQueueUrl = process.env.QUEUE_URL;

	beforeEach(() => {
		mockState.commands = [];
		delete process.env.SQS_QUEUE_URL;
		delete process.env.QUEUE_URL;
	});

	afterEach(() => {
		process.env.SQS_QUEUE_URL = originalSqsQueueUrl;
		process.env.QUEUE_URL = originalQueueUrl;
	});

	test("uses the provided SQS queueUrl override", async () => {
		await addTaskToQueue({
			jobName: JobName.Track,
			queueUrl:
				"https://sqs.eu-west-1.amazonaws.com/123456789012/track-dev.fifo",
			messageGroupId: "org:sandbox:cus_123",
			messageDeduplicationId: "idem_123",
			payload: {
				orgId: "org_123",
				env: AppEnv.Sandbox,
				apiVersion: ApiVersion.V2_1,
				body: {
					customer_id: "cus_123",
					feature_id: "messages",
				},
			},
		});

		expect(mockState.commands).toHaveLength(1);
		expect(mockState.commands[0]?.QueueUrl).toBe(
			"https://sqs.eu-west-1.amazonaws.com/123456789012/track-dev.fifo",
		);
		expect(mockState.commands[0]?.MessageGroupId).toBe("org:sandbox:cus_123");
		expect(mockState.commands[0]?.MessageDeduplicationId).toBe("idem_123");
	});
});
