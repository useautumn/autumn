import { JobName } from "@/queue/JobName.js";
import type { HandleCustomerCreatedData } from "@/utils/workerUtils/jobTypes/HandleCustomerCreatedData.js";
import type { AutumnContext } from "../../honoUtils/HonoEnv.js";
import { handleCustomerCreated } from "./handlers/handleCustomerCreated.js";
import { handleProductsUpdated } from "./handlers/handleProductsUpdated.js";

export const runActionHandlerTask = async ({
	jobName,
	payload,
	ctx,
}: {
	jobName: JobName;
	payload: any;
	ctx?: AutumnContext;
}) => {
	if (!ctx) {
		throw new Error("Context is required for action handler tasks");
	}

	const { logger } = ctx;

	try {
		switch (jobName) {
			case JobName.HandleProductsUpdated:
				await handleProductsUpdated({
					ctx,
					data: payload,
				});
				break;
			case JobName.HandleCustomerCreated:
				await handleCustomerCreated({
					ctx,
					data: payload as HandleCustomerCreatedData,
				});
				break;
		}
	} catch (error: any) {
		logger.error(`Error processing action handler job: ${error.message}`);
	} finally {
		// await clearLock({ lockKey });
	}
};
