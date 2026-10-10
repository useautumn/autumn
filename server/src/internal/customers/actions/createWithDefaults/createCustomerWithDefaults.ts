import type { CustomerData, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook.js";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated.js";
import { linkStripeCustomer } from "@/internal/customers/actions/linkStripeCustomer.js";
import { setCustomerCreationRecoveryStage } from "@/internal/customers/recovery/customerCreationRecoveryStage.js";
import { assertCustomerCreateWithinOrgLimit } from "@/internal/misc/rateLimiter/assertCustomerCreateWithinOrgLimit.js";
import { computeCreateCustomerPlan } from "./compute/computeCreateCustomerPlan.js";
import { executeAutumnCreateCustomerPlan } from "./execute/executeAutumnCreateCustomerPlan.js";
import {
	logAutumnPlanResult,
	logCreateCustomerContext,
} from "./logs/logCreateCustomer.js";
import { setupCreateCustomer } from "./setup/setupCreateCustomer.js";
import { syncCreatedCustomerFromStripe } from "./syncCreatedCustomerFromStripe.js";

/**
 * Create a customer and attach default products.
 *
 * Phase 1 - Create Autumn customer:
 *   setup → compute → execute
 *
 * Phase 2 - Link a Stripe customer when create_in_stripe is set.
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
}: {
	ctx: AutumnContext;
	customerId: string | null;
	customerData?: CustomerData;
}): Promise<FullCustomer> => {
	// Email-only calls may resolve to an existing customer, so only id'd creations count.
	if (customerId) await assertCustomerCreateWithinOrgLimit({ ctx });
	setCustomerCreationRecoveryStage({ ctx, stage: "pre_commit" });

	// ============ Phase 1: Create Autumn customer ============

	// 1. Setup
	const context = await setupCreateCustomer({
		ctx,
		customerId,
		customerData,
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

	if (autumnResult.type === "existing") {
		setCustomerCreationRecoveryStage({ ctx, stage: "completed" });
		return context.fullCustomer;
	}

	// ============ Phase 2: Link stripe customer ============

	// Webhook consumers call customers.get on receipt, so emission waits until
	// the Stripe customer id (when one is created) is persisted. Emitted in the
	// finally: phase 1 is committed either way, and a phase-2 throw must not
	// drop the webhooks — a client retry lands on the "existing" path above and
	// would never emit them.
	try {
		context.fullCustomer = await syncCreatedCustomerFromStripe({
			ctx,
			fullCustomer: context.fullCustomer,
			stripeCustomerId: customerData?.stripe_id,
		});

		// Paid defaults are no-card trials, which Autumn runs without Stripe.
		if (customerData?.create_in_stripe) {
			await linkStripeCustomer({ ctx, customer: context.fullCustomer });
		}

		setCustomerCreationRecoveryStage({ ctx, stage: "completed" });
		return context.fullCustomer;
	} finally {
		await billingPlanToSendProductsUpdated({
			ctx,
			autumnBillingPlan,
			billingContext: context,
		});

		// Fire-and-forget: don't block customer creation on svix delivery
		void sendBillingUpdatedWebhook({
			ctx,
			autumnBillingPlan,
			originalFullCustomer: context.fullCustomer,
		});
	}
};
