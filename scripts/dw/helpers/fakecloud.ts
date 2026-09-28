import { fakecloudPortFor } from "./ports.ts";
import { log } from "./shell.ts";

/** fakecloud's default emulated account and the region we start it in; both are
 *  stamped into every queue URL and ARN it hands back. */
export const FAKECLOUD_ACCOUNT_ID = "123456789012";
export const FAKECLOUD_REGION = "us-east-2";

/** EventBridge Scheduler requires a role ARN on every target. fakecloud never
 *  evaluates it, so any syntactically valid ARN works locally. */
export const FAKECLOUD_SCHEDULER_ROLE_ARN = `arn:aws:iam::${FAKECLOUD_ACCOUNT_ID}:role/fakecloud-scheduler`;

export const FIFO_QUEUE_NAMES = [
	"autumn.fifo",
	"autumn-track.fifo",
	"autumn-stripe-webhook.fifo",
] as const;

export const STANDARD_QUEUE_NAMES = ["autumn-track-async"] as const;

export function localQueueUrl({
	worktreeNum,
	queueName,
}: {
	worktreeNum: number;
	queueName: string;
}): string {
	const port = fakecloudPortFor(worktreeNum);
	return `http://localhost:${port}/${FAKECLOUD_ACCOUNT_ID}/${queueName}`;
}

/** Raw SQS JSON protocol rather than the AWS SDK: `scripts/` does not depend on
 *  @aws-sdk/client-sqs, and fakecloud does not verify SigV4 by default. */
async function createQueue({
	port,
	queueName,
	fifo,
}: {
	port: number;
	queueName: string;
	fifo: boolean;
}): Promise<void> {
	const response = await fetch(`http://localhost:${port}/`, {
		method: "POST",
		headers: {
			"content-type": "application/x-amz-json-1.0",
			"x-amz-target": "AmazonSQS.CreateQueue",
		},
		body: JSON.stringify({
			QueueName: queueName,
			...(fifo && {
				Attributes: {
					FifoQueue: "true",
					ContentBasedDeduplication: "true",
				},
			}),
		}),
	});
	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`fakecloud CreateQueue ${queueName} failed (${response.status}): ${body}`,
		);
	}
}

/** fakecloud has no startup config for seeding queues, so dw creates them itself.
 *  CreateQueue with unchanged attributes is a no-op, so this is safe to re-run. */
export async function ensureFakecloudQueues({
	port,
}: {
	port: number;
}): Promise<void> {
	for (const queueName of FIFO_QUEUE_NAMES) {
		await createQueue({ port, queueName, fifo: true });
	}
	for (const queueName of STANDARD_QUEUE_NAMES) {
		await createQueue({ port, queueName, fifo: false });
	}
	log(
		`fakecloud queues ready on :${port} (${[...FIFO_QUEUE_NAMES, ...STANDARD_QUEUE_NAMES].join(", ")})`,
	);
}
