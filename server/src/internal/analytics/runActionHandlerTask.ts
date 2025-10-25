import type { Job, Queue } from "bullmq";
import { JobName } from "@/queue/JobName.js";
import { getLock, releaseLock } from "@/queue/lockUtils.js";
import type { AutumnContext } from "../../honoUtils/HonoEnv.js";
import { handleCustomerCreated } from "./handlers/handleCustomerCreated.js";
import { handleProductsUpdated } from "./handlers/handleProductsUpdated.js";

export const runActionHandlerTask = async ({
	queue,
	job,
	useBackup,
	ctx,
}: {
	queue: Queue;
	job: Job;
	useBackup: boolean;
	ctx: AutumnContext;
}) => {
	const payload = job.data;
	const internalCustomerId = payload.internalCustomerId;
	const lockKey = `action:${internalCustomerId}`;
	const { logger } = ctx;

	try {
		const lock = await getLock({ queue, job, lockKey, useBackup });
		if (!lock) return;

		switch (job.name) {
			case JobName.HandleProductsUpdated:
				await handleProductsUpdated({
					ctx,
					data: payload,
				});
				break;
			case JobName.HandleCustomerCreated:
				await handleCustomerCreated({
					ctx,
					data: payload,
				});
				break;
		}
	} catch (error: any) {
		logger.error(`Error processing action handler job: ${error.message}`);
	} finally {
		await releaseLock({ lockKey, useBackup });
	}
};
