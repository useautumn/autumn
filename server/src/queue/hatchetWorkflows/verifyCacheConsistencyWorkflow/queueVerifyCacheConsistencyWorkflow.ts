import type { FullCustomer } from "../../../../../shared";
import type { Logger } from "../../../external/logtail/logtailUtils";
import { JobName } from "../../JobName";
import { runHatchetWorkflow } from "../../queueUtils";

export const queueVerifyCacheConsistencyWorkflow = async ({
	newCustomerProductId,
	previousFullCustomer,
	logger,
	source,
}: {
	newCustomerProductId: string;
	previousFullCustomer: FullCustomer;
	logger: Logger;
	source: string;
}) => {
	logger.info(
		`[${source}] Scheduling verify cache workflow for customer ${previousFullCustomer.id || previousFullCustomer.internal_id}`,
	);
	try {
		await runHatchetWorkflow({
			workflowName: JobName.VerifyCacheConsistency,
			payload: {
				orgId: previousFullCustomer.org_id,
				env: previousFullCustomer.env,
				customerId: previousFullCustomer.id || previousFullCustomer.internal_id,
				newCustomerProductId,
				source,
				previousFullCustomer: JSON.stringify(previousFullCustomer), // is there a better approach to this...?
			},
			delayMs: 5000,
		});
	} catch (error) {
		logger.error(
			`Failed to run verify cache consistency workflow for customer ${previousFullCustomer.id || previousFullCustomer.internal_id}, error: ${error}`,
		);
	}
};
