import type { Job, Queue } from "bullmq";
import { queueRedis } from "./initQueue.js";

export async function getLock({
	lockKey,
	queue,
	job,
}: {
	lockKey: string;
	queue: Queue;
	job: Job;
}) {
	if (!(await acquireLock({ lockKey }))) {
		await queue.add(job.name, job.data, {
			delay: 1000,
		});
		return false;
	}

	return true;
}

export async function acquireLock({
	lockKey,
	timeout = 30000,
}: {
	lockKey: string;
	timeout?: number;
}): Promise<boolean> {
	const acquired = await queueRedis.set(lockKey, "1", "PX", timeout, "NX");
	return acquired === "OK";
}

export async function releaseLock({
	lockKey,
}: {
	lockKey: string;
}): Promise<void> {
	await queueRedis.del(lockKey);
}
