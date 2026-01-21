import {
	type CreateCustomerInternalOptions,
	type CustomerData,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initFullCustomer } from "../../../cusUtils/initCustomer.js";
import type { CreateCustomerContext } from "../createCustomerContext.js";
import { setupCreateCustomerTrialContext } from "./setupCreateCustomerTrialContext.js";
import { setupDefaultProductsContext } from "./setupDefaultProductsContext.js";

/**
 * Setup step for creating a customer with defaults.
 *
 * 1. Init full customer
 * 2. Fetch default products
 * 3. Setup Stripe customer + trial context IF paid products exist
 */
export const setupCreateCustomer = async ({
	ctx,
	customerId,
	customerData,
	internalOptions,
}: {
	ctx: AutumnContext;
	customerId: string | null;
	customerData?: CustomerData;
	internalOptions?: CreateCustomerInternalOptions;
}): Promise<CreateCustomerContext> => {
	// 1. Validate
	if (!customerId && !customerData?.email) {
		throw new RecaseError({
			message: "Either customer ID or email is required",
		});
	}

	// 2. Init full customer
	const fullCustomer = initFullCustomer({ ctx, customerId, customerData });

	// 3. Fetch default products
	const { fullProducts, paidProducts, hasPaidProducts } =
		await setupDefaultProductsContext({ ctx, internalOptions });

	const currentEpochMs = Date.now();

	// 6. Setup trial context
	const trialContext = setupCreateCustomerTrialContext({
		paidProducts,
		currentEpochMs,
	});

	// 7. Return paid context (extends BillingContext)
	return {
		fullCustomer,
		fullProducts,

		currentEpochMs,
		trialContext,
		hasPaidProducts,
	};
};
