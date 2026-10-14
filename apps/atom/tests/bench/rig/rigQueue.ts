/**
 * The rig's stand-in for the shadow's linked `pushes` SQS queue: the AWS JSON 1.0 calls Atom's SDK push queue makes
 * (ReceiveMessage with a long poll, DeleteMessage), served by the stub. Unacked messages come back after the visibility timeout.
 */
import { createHash, randomUUID } from "node:crypto";

const VISIBILITY_MS = 30_000;
const SQS_JSON = { "content-type": "application/x-amz-json-1.0" };

type QueuedMessage = {
	id: string;
	body: string;
	md5: string;
	receiveCount: number;
	visibleAt: number;
};

export const createRigQueue = () => {
	const ready: QueuedMessage[] = [];
	const inFlight = new Map<string, QueuedMessage>();
	let waiters: (() => void)[] = [];
	const stats = { sent: 0, received: 0, deleted: 0, redelivered: 0 };

	setInterval(() => {
		const now = Date.now();
		for (const [receipt, message] of inFlight) {
			if (message.visibleAt > now) continue;
			inFlight.delete(receipt);
			ready.push(message);
			stats.redelivered++;
		}
	}, 1_000);

	function wakeAll() {
		const woken = waiters;
		waiters = [];
		for (const wake of woken) wake();
	}

	function send(body: string) {
		ready.push({
			id: randomUUID(),
			body,
			md5: createHash("md5").update(body).digest("hex"),
			receiveCount: 0,
			visibleAt: 0,
		});
		stats.sent++;
		wakeAll();
	}

	function take(max: number) {
		const now = Date.now();
		return ready.splice(0, max).map((message) => {
			message.receiveCount++;
			message.visibleAt = now + VISIBILITY_MS;
			const receipt = randomUUID();
			inFlight.set(receipt, message);
			stats.received++;
			return {
				MessageId: message.id,
				ReceiptHandle: receipt,
				MD5OfBody: message.md5,
				Body: message.body,
				Attributes: { ApproximateReceiveCount: String(message.receiveCount) },
			};
		});
	}

	async function receive({
		max,
		waitSeconds,
	}: {
		max: number;
		waitSeconds: number;
	}) {
		const deadline = Date.now() + waitSeconds * 1_000;
		while (ready.length === 0 && Date.now() < deadline)
			await new Promise<void>((resolve) => {
				const timer = setTimeout(resolve, deadline - Date.now());
				waiters.push(() => {
					clearTimeout(timer);
					resolve();
				});
			});
		return take(max);
	}

	async function handle(request: Request): Promise<Response> {
		const target = request.headers.get("x-amz-target") ?? "";
		const input = (await request.json().catch(() => ({}))) as {
			MaxNumberOfMessages?: number;
			WaitTimeSeconds?: number;
			ReceiptHandle?: string;
		};
		if (target === "AmazonSQS.ReceiveMessage") {
			const messages = await receive({
				max: input.MaxNumberOfMessages ?? 1,
				waitSeconds: input.WaitTimeSeconds ?? 0,
			});
			return Response.json(messages.length ? { Messages: messages } : {}, {
				headers: SQS_JSON,
			});
		}
		if (target === "AmazonSQS.DeleteMessage") {
			if (input.ReceiptHandle && inFlight.delete(input.ReceiptHandle))
				stats.deleted++;
			return Response.json({}, { headers: SQS_JSON });
		}
		return Response.json(
			{ __type: "com.amazonaws.sqs#UnsupportedOperation", message: target },
			{ status: 400, headers: SQS_JSON },
		);
	}

	return {
		send,
		handle,
		isQueueCall: (request: Request) => request.headers.has("x-amz-target"),
		stats: () => ({ ...stats, ready: ready.length, inFlight: inFlight.size }),
	};
};
