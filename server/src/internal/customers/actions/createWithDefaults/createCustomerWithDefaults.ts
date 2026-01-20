import type {
	CreateCustomerInternalOptions,
	CustomerData,
	FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan.js";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan.js";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan.js";
import { computeCreateCustomerPlan } from "./compute/computeCreateCustomerPlan.js";
import { executeAutumnCreateCustomerPlan } from "./execute/executeAutumnCreateCustomerPlan.js";
import { finalizeCreateCustomer } from "./finalizeCreateCustomer.js";
import {
	logAutumnPlanResult,
	logCreateCustomerContext,
} from "./logs/logCreateCustomer.js";
import { setupCreateCustomer } from "./setup/setupCreateCustomer.js";
import { setupCreateCustomerBillingContext } from "./setup/setupCreateCustomerBillingContext.js";

/**
 * Create a customer and attach default products.
 *
 * Phase 1 - Create Autumn customer:
 *   setup → compute → execute
 *
 * Phase 2 - Attach paid defaults (if any):
 *   setup billing context → evaluate → execute → finalize
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
	// ============ Phase 1: Create Autumn customer ============

	// 1. Setup
	const context = await setupCreateCustomer({
		ctx,
		customerId,
		customerData,
		internalOptions,
	});

	logCreateCustomerContext({ ctx, context });

	// 2. Compute
	const autumnBillingPlan = computeCreateCustomerPlan({ ctx, context });

	// 3. Execute Autumn
	const autumnResult = await executeAutumnCreateCustomerPlan({
		ctx,
		context,
		autumnBillingPlan,
	});

	logAutumnPlanResult({ ctx, result: autumnResult });

	// Early return if customer already existed or no paid products
	if (autumnResult.type === "existing") return context.fullCustomer;

	// ============ Phase 2: Create stripe customer / attach paid defaults ============

	// 4. Setup billing context (creates Stripe customer)

	const shouldCreateStripeCustomer =
		customerData?.create_in_stripe || context.hasPaidProducts;

	const shouldAttachPaidDefaults = context.hasPaidProducts;

	if (!shouldCreateStripeCustomer) return context.fullCustomer;

	const billingContext = await setupCreateCustomerBillingContext({
		ctx,
		context,
	});

	if (!shouldAttachPaidDefaults) return context.fullCustomer;

	// 5. Evaluate Stripe billing plan
	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan,
	});

	logStripeBillingPlan({ ctx, stripeBillingPlan, billingContext });

	// 6. Execute Stripe billing plan
	const { stripeSubscription } = await executeStripeBillingPlan({
		ctx,
		billingPlan: { autumn: autumnBillingPlan, stripe: stripeBillingPlan },
		billingContext,
	});

	// 7. Finalize (link subscription back to Autumn)
	return finalizeCreateCustomer({
		ctx,
		context,
		autumnBillingPlan,
		stripeSubscription,
	});
};
