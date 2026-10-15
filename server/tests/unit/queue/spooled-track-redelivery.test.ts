import { afterAll, describe, expect, mock, test } from "bun:test";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import {
	ChangeMessageVisibilityCommand,
	DeleteMessageBatchCommand,
	type Message,
	ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import { SpooledTrackTooOldError } from "@/internal/balances/track/balanceWorker/spool/spooledTrackReplay.js";
import { JobName } from "@/queue/JobName.js";
import { spooledTrackRedeliveryDelaySeconds } from "@/queue/spooledTrackRedelivery.js";

const realProcessMessage = { ...(await import("@/queue/processMessage.js")) };
const commandLogDown = new BalanceWorkerClientError({
	code: "COMMAND_LOG_UNAVAILABLE",
	outcome: "unknown",
	message: "Command log append failed: Closed connection",
});
mock.module("@/queue/processMessage.js", () => ({
	...realProcessMessage,
	processMessage: mock(async () => {
		throw commandLogDown;
	}),
}));
const { startPollingLoop } = await import("@/queue/initWorkers.js");
afterAll(() => {
	mock.module("@/queue/processMessage.js", () => realProcessMessage);
});

const spooledJob = {
	name: JobName.Track,
	data: { body: {}, spooledAt: 1_790_000_000_000 },
};
const queuedJob = { name: JobName.Track, data: { body: {} } };

describe("a spooled track's failed replays spread across the replay window", () => {
	test("waits 20/40/90/150 s after receives 1-4, so receive 5 lands ~5 min in, 2 min inside the 7-min cap", () => {
		const delays = [1, 2, 3, 4, 5].map((receiveCount) =>
			spooledTrackRedeliveryDelaySeconds({
				job: spooledJob,
				error: commandLogDown,
				receiveCount,
			}),
		);
		expect(delays).toEqual([20, 40, 90, 150, null]);
		const fifthReceiveAtSeconds = [20, 40, 90, 150].reduce((a, b) => a + b);
		expect(fifthReceiveAtSeconds).toBe(300);
	});

	test("leaves a too-old spool and an ordinary queued track on the receive's own visibility", () => {
		expect(
			spooledTrackRedeliveryDelaySeconds({
				job: spooledJob,
				error: new SpooledTrackTooOldError({ ageMs: 500_000 }),
				receiveCount: 1,
			}),
		).toBeNull();
		expect(
			spooledTrackRedeliveryDelaySeconds({
				job: queuedJob,
				error: commandLogDown,
				receiveCount: 1,
			}),
		).toBeNull();
	});

	test("the polling loop holds the failed message back instead of deleting it", async () => {
		const message: Message = {
			MessageId: "message-1",
			ReceiptHandle: "receipt-1",
			Body: JSON.stringify(spooledJob),
			Attributes: { ApproximateReceiveCount: "2" },
		};
		const visibilityChanges: unknown[] = [];
		const deletes: unknown[] = [];
		let receiveCalls = 0;
		const sqs = {
			send: async (command: unknown) => {
				if (command instanceof ReceiveMessageCommand) {
					receiveCalls++;
					if (receiveCalls === 1) return { Messages: [message] };
					const aborted = new Error("aborted");
					aborted.name = "AbortError";
					throw aborted;
				}
				if (command instanceof ChangeMessageVisibilityCommand) {
					visibilityChanges.push(command.input);
					return {};
				}
				if (command instanceof DeleteMessageBatchCommand) {
					deletes.push(command.input.Entries);
					return { Successful: [], Failed: [] };
				}
				throw new Error("Unexpected SQS command");
			},
		};

		await startPollingLoop({
			db: {} as never,
			queueId: "track",
			queueUrl: "https://sqs.eu-west-2.amazonaws.com/123/track-async",
			isFifo: false,
			getSqsClientFn: () => sqs as never,
			recreateSqsClientFn: () => sqs as never,
			shouldPoll: () => true,
		});

		expect(visibilityChanges).toEqual([
			{
				QueueUrl: "https://sqs.eu-west-2.amazonaws.com/123/track-async",
				ReceiptHandle: "receipt-1",
				VisibilityTimeout: 40,
			},
		]);
		expect(deletes.flat()).toHaveLength(0);
	});
});
