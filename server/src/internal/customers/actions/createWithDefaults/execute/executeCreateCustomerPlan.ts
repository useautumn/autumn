import type { FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/autumnBillingPlan.js";
import { initFullCustomerProductFromProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromProduct.js";
import type { CreateCustomerContext } from "../createCustomerContext.js";
import { logAutumnPlanResult } from "../logs/logCreateCustomer.js";
import { executeAutumnCreateCustomerPlan } from "./executeAutumnCreateCustomerPlan.js";
import { executeStripeCreateCustomerPlan } from "./executeStripeCreateCustomerPlan.js";

/**
 * Execute step for creating a customer with defaults.
 *
 * Flow:
 * 1. Compute: build customer products + autumn billing plan
 * 2. Execute Autumn: DB transaction (upsert customer + insert products)
 * 3. Execute Stripe: create Stripe customer + subscription (if paid products)
 *
 * Handles idempotency:
 * - If customer already exists (wasUpdate or race condition), returns existing customer
 * - Otherwise creates new customer with products and Stripe subscription
 */
export const executeCreateCustomerPlan = async ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: CreateCustomerContext;
}): Promise<FullCustomer> => {
	const { fullCustomer, fullProducts, currentEpochMs } = context;

	// 1. Compute autumn billing plan (no Stripe customer needed yet)
	const insertCustomerProducts = fullProducts.map((product) =>
		initFullCustomerProductFromProduct({
			ctx,
			initContext: {
				fullCustomer,
				fullProduct: product,
				currentEpochMs,
			},
		}),
	);

	const autumnBillingPlan: AutumnBillingPlan = {
		insertCustomerProducts,
	};

	// 2. Execute Autumn (DB) - handles race conditions
	const autumnResult = await executeAutumnCreateCustomerPlan({
		ctx,
		fullCustomer,
		autumnBillingPlan,
	});

	logAutumnPlanResult({ ctx, result: autumnResult });

	// If customer already existed, return it (no Stripe work needed)
	if (autumnResult.type === "existing") return autumnResult.fullCustomer;
	if (!context.hasPaidProducts) return autumnResult.fullCustomer;

	// must pass in old full customer to ensure subscription plan is correctly determined...
	await executeStripeCreateCustomerPlan({
		ctx,
		context,
		autumnBillingPlan,
	});

	return context.fullCustomer;
};
