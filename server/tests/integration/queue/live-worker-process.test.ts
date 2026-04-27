import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
	CreateQueueCommand,
	DeleteQueueCommand,
	GetQueueAttributesCommand,
	SendMessageCommand,
	SQSClient,
} from "@aws-sdk/client-sqs";

const ELASTICMQ_JAR = `${process.env.HOME}/.autumn-agent/elasticmq/elasticmq.jar`;
const WORKER_FIXTURE_PATH = new URL(
	"./fixtures/livePollingWorker.ts",
	import.meta.url,
).pathname;

const children: ChildProcess[] = [];
const queueUrls: string[] = [];
let elasticmq: ChildProcess | null = null;
let tempDir: string | null = null;
let sqsEndpoint = "";
let sqs: SQSClient;

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

beforeAll(async () => {
	const port = 19_000 + Math.floor(Math.random() * 1_000);
	const statsPort = port + 1;
	tempDir = await mkdtemp(join(tmpdir(), "elasticmq-"));
	const configPath = join(tempDir, "elasticmq.conf");
	sqsEndpoint = `http://127.0.0.1:${port}`;

	await writeFile(
		configPath,
		`include classpath("application.conf")
node-address {
  protocol = http
  host = "127.0.0.1"
  port = ${port}
  context-path = ""
}
rest-sqs {
  enabled = true
  bind-port = ${port}
  bind-hostname = "127.0.0.1"
  sqs-limits = strict
}
generate-node-address = false
rest-stats {
  enabled = true
  bind-port = ${statsPort}
  bind-hostname = "127.0.0.1"
}
queues {}
`,
	);

	elasticmq = spawn(
		"java",
		[`-Dconfig.file=${configPath}`, "-jar", ELASTICMQ_JAR],
		{
			stdio: ["ignore", "pipe", "pipe"],
		},
	);

	sqs = new SQSClient({
		region: "us-east-1",
		endpoint: sqsEndpoint,
		credentials: {
			accessKeyId: "x",
			secretAccessKey: "x",
		},
	});

	await waitFor({
		timeoutMs: 15_000,
		check: async () => {
			try {
				const response = await fetch(
					`${sqsEndpoint}/?Action=ListQueues&Version=2012-11-05`,
				);
				return response.ok;
			} catch {
				return false;
			}
		},
	});
});

afterAll(async () => {
	if (elasticmq) {
		elasticmq.kill("SIGTERM");
		await waitForExit({ child: elasticmq });
	}

	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
	}
});

const createTestQueue = async () => {
	const name = `autumn-live-${randomUUID()}.fifo`;
	const response = await sqs.send(
		new CreateQueueCommand({
			QueueName: name,
			Attributes: {
				FifoQueue: "true",
				ContentBasedDeduplication: "true",
				VisibilityTimeout: "5",
			},
		}),
	);

	if (!response.QueueUrl) {
		throw new Error("Failed to create test queue");
	}

	queueUrls.push(response.QueueUrl);
	return response.QueueUrl;
};

const getQueueCounts = async ({ queueUrl }: { queueUrl: string }) => {
	const response = await sqs.send(
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
	const child = spawn(
		"bun",
		[WORKER_FIXTURE_PATH],
		{
			cwd: process.cwd(),
			env: {
				...process.env,
				TEST_QUEUE_URL: queueUrl,
				TEST_SQS_ENDPOINT: sqsEndpoint,
				TEST_SHOULD_POLL: shouldPoll ? "true" : "false",
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);

	children.push(child);
	return child;
};

const sendTestMessage = async ({ queueUrl }: { queueUrl: string }) => {
	await sqs.send(
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
		await sqs.send(
			new DeleteQueueCommand({
				QueueUrl: queueUrl,
			}),
		);
	}
});

describe("live worker process queue polling", () => {
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
	}, 15_000);

	test("disabled worker leaves the live SQS message untouched", async () => {
		const queueUrl = await createTestQueue();

		startWorker({ queueUrl, shouldPoll: false });
		await sendTestMessage({ queueUrl });

		await new Promise((resolve) => setTimeout(resolve, 1_500));

		const counts = await getQueueCounts({ queueUrl });
		expect(counts.visible).toBe(1);
		expect(counts.notVisible).toBe(0);
	}, 15_000);
});
