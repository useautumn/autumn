import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ApiVersion, AppEnv } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";

const mockState = {
	commands: [] as Record<string, unknown>[],
	originalSend: null as null | SQSClient["send"],
};

import { JobName } from "@/queue/JobName.js";
import { getSqsClient } from "@/queue/initSqs.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";

describe("addTaskToQueue queue override", () => {
	const originalSqsQueueUrl = process.env.SQS_QUEUE_URL_V2;
	const originalQueueUrl = process.env.QUEUE_URL;

	beforeEach(() => {
		mockState.commands = [];
		const sqsClient = getSqsClient();
		mockState.originalSend = sqsClient.send.bind(sqsClient);
		sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
			mockState.commands.push(command.input);
			return {};
		}) as typeof sqsClient.send;
		delete process.env.SQS_QUEUE_URL_V2;
		delete process.env.QUEUE_URL;
	});

	afterEach(() => {
		if (mockState.originalSend) {
			const sqsClient = getSqsClient();
			sqsClient.send = mockState.originalSend as typeof sqsClient.send;
		}
		process.env.SQS_QUEUE_URL_V2 = originalSqsQueueUrl;
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
				customerId: "cus_123",
				requestId: "req_123",
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
