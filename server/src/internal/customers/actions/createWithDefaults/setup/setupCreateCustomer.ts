import { type CustomerData, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initFullCustomer } from "../../../cusUtils/initCustomer.js";
import type { CreateCustomerContext } from "../createCustomerContext.js";
import { setupCreateCustomerTrialContext } from "./setupCreateCustomerTrialContext.js";
import { setupDefaultProductsContext } from "./setupDefaultProductsContext.js";

export const setupCreateCustomer = async ({
	ctx,
	customerId,
	customerData,
}: {
	ctx: AutumnContext;
	customerId: string | null;
	customerData?: CustomerData;
}): Promise<CreateCustomerContext> => {
	if (!customerId && !customerData?.email) {
		throw new RecaseError({
			message: "Either customer ID or email is required",
			statusCode: 400,
		});
	}

	const fullCustomer = initFullCustomer({ ctx, customerId, customerData });

	const { fullProducts, paidProducts, hasPaidProducts } =
		await setupDefaultProductsContext({ ctx, customerData, scope: "customer" });

	const currentEpochMs = Date.now();

	const trialContext = setupCreateCustomerTrialContext({
		paidProducts,
		currentEpochMs,
	});

	return {
		fullCustomer,
		fullProducts,

		currentEpochMs,
		trialContext,
		hasPaidProducts,
		autoTopups: customerData?.billing_controls?.auto_topups,
	};
};
