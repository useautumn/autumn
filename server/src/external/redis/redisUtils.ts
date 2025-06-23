import { ErrCode } from "@/errors/errCodes.js";
import { QueueManager } from "@/queue/QueueManager.js";
import RecaseError from "@/utils/errorUtils.js";

export const handleAttachRaceCondition = async ({
  req,
  res,
}: {
  req: any;
  res: any;
}) => {
  const redisConn = await QueueManager.getConnection({ useBackup: false });
  const customerId = req.body.customer_id;
  const orgId = req.orgId;
  const env = req.env;
  try {
    const lockKey = `attach_${customerId}_${orgId}_${env}`;
    const existingLock = await redisConn.get(lockKey);
    if (existingLock) {
      throw new RecaseError({
        message: `Attach already runnning for customer ${customerId}, try again in a few seconds`,
        code: ErrCode.InvalidRequest,
        statusCode: 400,
      });
    }
    // Create lock with 5 second timeout
    await redisConn.set(lockKey, "1", "PX", 5000, "NX");

    let originalJson = res.json;
    res.json = async function (body: any) {
      try {
        await clearLock({ lockKey, logger: req.logtail });
      } catch (error) {
        req.logtail.warn("❗️❗️ Error clearing lock", {
          error,
        });
      }
      originalJson.call(this, body);
    };

    return lockKey;
  } catch (error) {
    if (error instanceof RecaseError) {
      throw error;
    }

    req.logtail.warn("❗️❗️ Error acquiring lock", {
      error,
    });
    return null;
  }
};

export const handleCustomerRaceCondition = async ({
  action,
  customerId,
  orgId,
  env,
  res,
  logger,
}: {
  action: any;
  customerId: string;
  orgId: string;
  env: string;
  res: any;
  logger: any;
}) => {
  const redisConn = await QueueManager.getConnection({ useBackup: false });
  try {
    const lockKey = `${action}_${customerId}_${orgId}_${env}`;
    const existingLock = await redisConn.get(lockKey);
    if (existingLock) {
      throw new RecaseError({
        message: `Action ${action} already running for customer ${customerId}, try again in a few seconds`,
        code: ErrCode.InvalidRequest,
        statusCode: 400,
      });
    }
    // Create lock with 5 second timeout
    await redisConn.set(lockKey, "1", "PX", 5000, "NX");

    let originalJson = res.json;
    res.json = async function (body: any) {
      try {
        await clearLock({ lockKey, logger });
      } catch (error) {
        logger.warn("❗️❗️ Error clearing lock");
        logger.warn(error);
      }
      originalJson.call(this, body);
    };

    return lockKey;
  } catch (error) {
    if (error instanceof RecaseError) {
      throw error;
    }

    logger.warn("❗️❗️ Error acquiring lock");
    logger.warn(error);
    return null;
  }
};

export const clearLock = async ({
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
    logger.warn("❗️❗️ Error clearing lock");
    logger.warn(error);
  }
};
