import type {
	CreateCustomerInternalOptions,
	CustomerData,
	FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeCreateCustomerPlan } from "./execute/executeCreateCustomerPlan.js";
import { logCreateCustomerContext } from "./logs/logCreateCustomer.js";
import { setupCreateCustomer } from "./setup/setupCreateCustomer.js";

/**
 * Create a customer and attach default products.
 *
 * Flow:
 * 1. Setup: init customer, fetch defaults, setup Stripe (if paid)
 * 2. Compute: build customer products, autumn plan, stripe plan
 * 3. Execute: transaction + Stripe + build final customer
 *
 * Idempotency:
 * - Email exists with id=NULL, new request has id=NULL: Returns existing customer
 * - Email exists with id=NULL, new request has ID: Claims the row (sets ID)
 * - Customer ID already exists: Returns existing customer
 */
export const createCustomerWithDefaults = async ({
	ctx,
	customerId,
	customerData,
	internalOptions,
}: {
	ctx: AutumnContext;
	customerId: string | null;
	customerData?: CustomerData;
	internalOptions?: CreateCustomerInternalOptions;
}): Promise<FullCustomer> => {
	// 1. Setup
	const context = await setupCreateCustomer({
		ctx,
		customerId,
		customerData,
		internalOptions,
	});

	logCreateCustomerContext({ ctx, context });

	// 3. Execute
	return executeCreateCustomerPlan({ ctx, context });
};
