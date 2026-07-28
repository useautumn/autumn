import { describe, expect, test } from "bun:test";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import { getSqsClient, recreateSqsClient } from "@/queue/initSqs.js";
import { startPollingLoop } from "@/queue/initWorkers.js";

const makeAbortError = () => {
	const error = new Error("aborted") as Error & { name: string };
	error.name = "AbortError";
	return error;
};

describe("SQS poll recovery", () => {
	test("recovers a hung receive without recycling the worker", async () => {
		let releaseHungReceive = () => {};
		let recreateCalls = 0;

		const hungClient = {
			send: (
				command: unknown,
				options?: { abortSignal?: AbortSignal },
			): Promise<unknown> => {
				if (!(command instanceof ReceiveMessageCommand)) {
					throw new Error("Unexpected SQS command");
				}

				return new Promise((_, reject) => {
					releaseHungReceive = () => reject(makeAbortError());
					options?.abortSignal?.addEventListener(
						"abort",
						() => reject(makeAbortError()),
						{ once: true },
					);
				});
			},
		};
		const replacementClient = {
			send: async () => {
				throw makeAbortError();
			},
		};

		const loop = startPollingLoop({
			db: {} as never,
			queueId: "primary",
			queueUrl: "https://sqs.us-east-2.amazonaws.com/123/primary.fifo",
			isFifo: true,
			getSqsClientFn: () => hungClient as never,
			recreateSqsClientFn: () => {
				recreateCalls++;
				return replacementClient as never;
			},
			shouldPoll: () => true,
			receiveTimeoutMs: 10,
		});

		await new Promise((resolve) => setTimeout(resolve, 40));
		const observedRecreateCalls = recreateCalls;
		releaseHungReceive();
		await loop;

		expect(observedRecreateCalls).toBe(1);
	});

	test("uses an isolated client for each queue", () => {
		const primary = getSqsClient({
			queueUrl: "https://sqs.us-east-2.amazonaws.com/123/primary.fifo",
		});
		const track = getSqsClient({
			queueUrl: "https://sqs.us-east-2.amazonaws.com/123/track.fifo",
		});
		const nextPrimary = recreateSqsClient({
			queueUrl: "https://sqs.us-east-2.amazonaws.com/123/primary.fifo",
		});

		expect(primary).not.toBe(track);
		expect(nextPrimary).not.toBe(primary);
		expect(
			getSqsClient({
				queueUrl: "https://sqs.us-east-2.amazonaws.com/123/track.fifo",
			}),
		).toBe(track);
	});
});
