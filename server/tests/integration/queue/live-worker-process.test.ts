import { afterEach, describe, expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	CreateQueueCommand,
	DeleteQueueCommand,
	GetQueueAttributesCommand,
	SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { extractLocalEndpoint, getSqsClient } from "@/queue/initSqs.js";

// Same queue URL the workers poll; test queues sit beside it on the same local SQS (goaws/fakecloud).
const primaryQueueUrl = process.env.SQS_QUEUE_URL_V2;
const hasLocalSqs = !!extractLocalEndpoint({ queueUrl: primaryQueueUrl });
const WORKER_FIXTURE_PATH = new URL(
	"./fixtures/livePollingWorker.ts",
	import.meta.url,
).pathname;

const children: ChildProcess[] = [];
const queueUrls: string[] = [];

const waitForExit = async ({
	child,
	forceKillAfterMs = 1_000,
}: {
	child: ChildProcess;
	forceKillAfterMs?: number;
}) => {
	if (child.exitCode !== null || child.signalCode !== null) {
		return;
	}

	await new Promise<void>((resolve) => {
		const timeout = setTimeout(() => {
			child.kill("SIGKILL");
		}, forceKillAfterMs);

		child.once("exit", () => {
			clearTimeout(timeout);
			resolve();
		});
	});
};

const waitFor = async ({
	check,
	timeoutMs = 8_000,
	intervalMs = 200,
}: {
	check: () => Promise<boolean>;
	timeoutMs?: number;
	intervalMs?: number;
}) => {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		if (await check()) return;
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	throw new Error(`Condition not met within ${timeoutMs}ms`);
};

const createTestQueue = async () => {
	const name = `autumn-live-${randomUUID()}.fifo`;
	const queueUrl = new URL(name, primaryQueueUrl).toString();
	await getSqsClient({ queueUrl }).send(
		new CreateQueueCommand({
			QueueName: name,
			Attributes: {
				FifoQueue: "true",
				ContentBasedDeduplication: "true",
				VisibilityTimeout: "5",
			},
		}),
	);

	queueUrls.push(queueUrl);
	return queueUrl;
};

const getQueueCounts = async ({ queueUrl }: { queueUrl: string }) => {
	const response = await getSqsClient({ queueUrl }).send(
		new GetQueueAttributesCommand({
			QueueUrl: queueUrl,
			AttributeNames: [
				"ApproximateNumberOfMessages",
				"ApproximateNumberOfMessagesNotVisible",
			],
		}),
	);

	return {
		visible: Number.parseInt(
			response.Attributes?.ApproximateNumberOfMessages ?? "0",
			10,
		),
		notVisible: Number.parseInt(
			response.Attributes?.ApproximateNumberOfMessagesNotVisible ?? "0",
			10,
		),
	};
};

const startWorker = ({
	queueUrl,
	shouldPoll,
}: {
	queueUrl: string;
	shouldPoll: boolean;
}) => {
	const child = spawn("bun", [WORKER_FIXTURE_PATH], {
		cwd: process.cwd(),
		env: {
			...process.env,
			TEST_QUEUE_URL: queueUrl,
			TEST_SHOULD_POLL: shouldPoll ? "true" : "false",
		},
		stdio: ["ignore", "pipe", "pipe"],
	});

	children.push(child);
	return child;
};

const sendTestMessage = async ({ queueUrl }: { queueUrl: string }) => {
	await getSqsClient({ queueUrl }).send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify({
				name: "integration-test-job",
				data: {},
			}),
			MessageGroupId: "test",
			MessageDeduplicationId: randomUUID(),
		}),
	);
};

afterEach(async () => {
	for (const child of children.splice(0)) {
		child.kill("SIGTERM");
		await waitForExit({ child });
	}

	for (const queueUrl of queueUrls.splice(0)) {
		await getSqsClient({ queueUrl }).send(
			new DeleteQueueCommand({
				QueueUrl: queueUrl,
			}),
		);
	}
});

describe.skipIf(!hasLocalSqs)(
	"live worker process queue polling (needs SQS_QUEUE_URL_V2 on a local SQS emulator)",
	() => {
		test("enabled worker consumes a live SQS message", async () => {
			const queueUrl = await createTestQueue();

			startWorker({ queueUrl, shouldPoll: true });
			await sendTestMessage({ queueUrl });

			await waitFor({
				check: async () => {
					const counts = await getQueueCounts({ queueUrl });
					return counts.visible === 0 && counts.notVisible === 0;
				},
			});
		});

		test("disabled worker leaves the live SQS message untouched", async () => {
			const queueUrl = await createTestQueue();

			startWorker({ queueUrl, shouldPoll: false });
			await sendTestMessage({ queueUrl });

			await new Promise((resolve) => setTimeout(resolve, 1_500));

			const counts = await getQueueCounts({ queueUrl });
			expect(counts.visible).toBe(1);
			expect(counts.notVisible).toBe(0);
		});
	},
);
