import { ErrCode } from "@/errors/errCodes.js";
import { QueueManager } from "@/queue/QueueManager.js";
import RecaseError from "@/utils/errorUtils.js";

export const getWebhookLock = async ({
  lockKey,
  logger,
}: {
  lockKey: string;
  logger: any;
}) => {
  const redisConn = await QueueManager.getConnection({ useBackup: false });
  try {
    const existingLock = await redisConn.get(lockKey);
    if (existingLock) {
      return false;
    }
    // Create lock with 5 second timeout
    await redisConn.set(lockKey, "1", "PX", 5000, "NX");
    return true;
  } catch (error) {
    logger.error("❗️❗️ Error acquiring lock");
    logger.error(error);
    return false;
  }
};

export const releaseWebhookLock = async ({
  lockKey,
  logger,
}: {
  lockKey: string;
  logger: any;
}) => {
  try {
    const redisConn = await QueueManager.getConnection({ useBackup: false });
    await redisConn.del(lockKey);
  } catch (error) {
    logger.error("❗️❗️ Error releasing lock");
    logger.error(error);
  }
};
