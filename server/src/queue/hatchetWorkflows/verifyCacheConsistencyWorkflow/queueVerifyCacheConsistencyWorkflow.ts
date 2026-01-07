import {
	cusProductToPrices,
	type FullCusProduct,
	type FullCustomer,
	isFreeProduct,
} from "@autumn/shared";
import type { Logger } from "../../../external/logtail/logtailUtils";
import { generateId } from "../../../utils/genUtils";
import { JobName } from "../../JobName";
import { runHatchetWorkflow } from "../../queueUtils";

export const queueVerifyCacheConsistencyWorkflow = async ({
	newCustomerProduct,
	previousFullCustomer,
	logger,
	source,
}: {
	newCustomerProduct: FullCusProduct;
	previousFullCustomer: FullCustomer;
	logger: Logger;
	source: string;
}) => {
	const workflowId = generateId("workflow");
	logger.info(
		`[${source}] Scheduling verify cache workflow for customer ${previousFullCustomer.id || previousFullCustomer.internal_id}, workflowId: ${workflowId}`,
	);
	try {
		// 1. Check if new customer product is not free
		const newPrices = cusProductToPrices({ cusProduct: newCustomerProduct });
		if (isFreeProduct({ prices: newPrices })) return;

		await runHatchetWorkflow({
			workflowName: JobName.VerifyCacheConsistency,
			metadata: {
				workflowId,
				customerId: previousFullCustomer.id ?? "",
			},
			payload: {
				orgId: previousFullCustomer.org_id,
				env: previousFullCustomer.env,
				customerId: previousFullCustomer.id || previousFullCustomer.internal_id,
				newCustomerProductId: newCustomerProduct.id,
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
