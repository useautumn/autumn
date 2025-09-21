import { DrizzleCli } from "@/db/initDrizzle.js";
import { JobName } from "@/queue/JobName.js";
import { getLock, releaseLock } from "@/queue/lockUtils.js";
import { Queue } from "bullmq";
import { Job } from "bullmq";
import { handleProductsUpdated } from "./handlers/handleProductsUpdated.js";
import { handleCustomerCreated } from "./handlers/handleCustomerCreated.js";

export const runActionHandlerTask = async ({
  queue,
  job,
  logger,
  db,
  useBackup,
}: {
  queue: Queue;
  job: Job;
  logger: any;
  db: DrizzleCli;
  useBackup: boolean;
}) => {
  let payload = job.data;
  let internalCustomerId = payload.internalCustomerId;
  let lockKey = `action:${internalCustomerId}`;

  try {
    let lock = await getLock({ queue, job, lockKey, useBackup });
    if (!lock) return;

    switch (job.name) {
      case JobName.HandleProductsUpdated:
        await handleProductsUpdated({
          db,
          logger,
          data: payload,
        });
        break;
      case JobName.HandleCustomerCreated:
        await handleCustomerCreated({
          db,
          logger,
          data: payload,
        });
        break;
    }
  } catch (error: any) {
    logger.error("Error processing action handler job:", {
      // jobName: job.name,
      // payload,
      message: error.message,
    });
  } finally {
    await releaseLock({ lockKey, useBackup });
  }
};
