import type { Job, Queue } from "bullmq";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { JobName } from "@/queue/JobName.js";
import { getLock, releaseLock } from "@/queue/lockUtils.js";
import { handleCustomerCreated } from "./handlers/handleCustomerCreated.js";
import { handleProductsUpdated } from "./handlers/handleProductsUpdated.js";

export const runActionHandlerTask = async ({
	queue,
	job,
	logger,
	db,
}: {
	queue: Queue;
	job: Job;
	logger: any;
	db: DrizzleCli;
}) => {
	const payload = job.data;
	const internalCustomerId = payload.internalCustomerId;
	const lockKey = `action:${internalCustomerId}`;

	try {
		const lock = await getLock({ queue, job, lockKey });
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
		logger.error(`Error processing action handler job: ${error.message}`);
	} finally {
		await releaseLock({ lockKey });
	}
};
