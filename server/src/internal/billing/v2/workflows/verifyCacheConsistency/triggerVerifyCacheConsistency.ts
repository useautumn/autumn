import {
	cusProductToPrices,
	type FullCusProduct,
	type FullCustomer,
	isFreeProduct,
} from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { workflows } from "@/queue/workflows.js";
import { generateId } from "@/utils/genUtils.js";

export const triggerVerifyCacheConsistency = async ({
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

		await workflows.triggerVerifyCacheConsistency(
			{
				orgId: previousFullCustomer.org_id,
				env: previousFullCustomer.env,
				customerId: previousFullCustomer.id || previousFullCustomer.internal_id,
				newCustomerProductId: newCustomerProduct.id,
				source,
				previousFullCustomer: JSON.stringify(previousFullCustomer),
			},
			{
				delayMs: 5000,
				metadata: {
					workflowId,
					customerId: previousFullCustomer.id ?? "",
				},
			},
		);
	} catch (error) {
		logger.error(
			`Failed to run verify cache consistency workflow for customer ${previousFullCustomer.id || previousFullCustomer.internal_id}, error: ${error}`,
		);
	}
};
