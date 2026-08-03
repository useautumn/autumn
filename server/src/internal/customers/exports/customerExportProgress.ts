import {
	type CustomerExportProgress,
	runMetadataToCustomerExportProgress,
} from "@autumn/shared";
import { runs } from "@trigger.dev/sdk/v3";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { getCustomerExportErrorMessage } from "./customerExportErrorMessage.js";

/** Failure to read optional progress must not fail export listing. */
export const getCustomerExportProgress = async ({
	triggerRunId,
	logger,
}: {
	triggerRunId: string;
	logger: Logger;
}): Promise<CustomerExportProgress | null> => {
	try {
		const run = await runs.retrieve(triggerRunId);
		return runMetadataToCustomerExportProgress({ metadata: run.metadata });
	} catch (error) {
		logger.warn("customer-export: failed to read run progress", {
			data: {
				triggerRunId,
				error: getCustomerExportErrorMessage({ error }),
			},
		});
		return null;
	}
};
