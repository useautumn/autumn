import { describe, expect, test } from "bun:test";
import { deriveSqsQueueArn } from "@/queue/utils/deriveSqsQueueArn.js";

describe("deriveSqsQueueArn", () => {
	test("keeps the region and account of a real SQS URL", () => {
		expect(
			deriveSqsQueueArn({
				queueUrl:
					"https://sqs.us-east-2.amazonaws.com/123456789012/autumn.fifo",
			}),
		).toBe("arn:aws:sqs:us-east-2:123456789012:autumn.fifo");
		expect(
			deriveSqsQueueArn({
				queueUrl:
					"https://sqs.eu-west-1.amazonaws.com/000000000000/autumn-track-async",
			}),
		).toBe("arn:aws:sqs:eu-west-1:000000000000:autumn-track-async");
	});

	test("gives a local emulator URL the default region", () => {
		expect(
			deriveSqsQueueArn({
				queueUrl: "http://localhost:4666/123456789012/autumn.fifo",
			}),
		).toBe("arn:aws:sqs:us-east-2:123456789012:autumn.fifo");
		expect(
			deriveSqsQueueArn({
				queueUrl: "http://127.0.0.1:9566/123456789012/autumn-track.fifo",
			}),
		).toBe("arn:aws:sqs:us-east-2:123456789012:autumn-track.fifo");
	});

	test("rejects a URL with no account id or queue name", () => {
		expect(() => deriveSqsQueueArn({ queueUrl: "" })).toThrow();
		expect(() =>
			deriveSqsQueueArn({ queueUrl: "http://localhost:4666/autumn.fifo" }),
		).toThrow();
		expect(() =>
			deriveSqsQueueArn({ queueUrl: "http://localhost:4666/123456789012/" }),
		).toThrow();
	});
});
