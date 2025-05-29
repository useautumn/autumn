import { Job, Queue } from "bullmq";
import { QueueManager } from "./QueueManager.js";

export const getRedisConnection = ({
  useBackup = false,
}: {
  useBackup?: boolean;
}) => {
  let redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  if (useBackup) {
    redisUrl = process.env.REDIS_BACKUP_URL || "redis://localhost:6379";
  }

  return {
    connection: {
      url: redisUrl,
      // enableOfflineQueue: false,
    },
  };
};

export async function getLock({
  lockKey,
  queue,
  job,
  useBackup = false,
}: {
  lockKey: string;
  queue: Queue;
  job: Job;
  useBackup?: boolean;
}) {
  if (!(await acquireLock({ lockKey, useBackup }))) {
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
  useBackup = false,
}: {
  lockKey: string;
  timeout?: number;
  useBackup?: boolean;
}): Promise<boolean> {
  // const redis = getRedisClient({ useBackup });
  const redis = await QueueManager.getConnection({ useBackup });

  const acquired = await redis.set(lockKey, "1", "PX", timeout, "NX");
  return acquired === "OK";
}

export async function releaseLock({
  lockKey,
  useBackup,
}: {
  lockKey: string;
  useBackup: boolean;
}): Promise<void> {
  const redis = await QueueManager.getConnection({ useBackup });
  await redis.del(lockKey);
}
