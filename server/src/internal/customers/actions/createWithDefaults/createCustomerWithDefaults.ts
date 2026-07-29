import {
	type CustomerData,
	type FullCustomer,
	hasActivePaidSubscription,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan.js";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan.js";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan.js";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook.js";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated.js";
import { setCustomerCreationRecoveryStage } from "@/internal/customers/recovery/customerCreationRecoveryStage.js";
import { computeCreateCustomerPlan } from "./compute/computeCreateCustomerPlan.js";
import { executeAutumnCreateCustomerPlan } from "./execute/executeAutumnCreateCustomerPlan.js";
import { finalizeCreateCustomer } from "./finalizeCreateCustomer.js";
import {
	logAutumnPlanResult,
	logCreateCustomerContext,
} from "./logs/logCreateCustomer.js";
import { setupCreateCustomer } from "./setup/setupCreateCustomer.js";
import { setupCreateCustomerBillingContext } from "./setup/setupCreateCustomerBillingContext.js";
import { syncCreatedCustomerFromStripe } from "./syncCreatedCustomerFromStripe.js";

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
}: {
	ctx: AutumnContext;
	customerId: string | null;
	customerData?: CustomerData;
}): Promise<FullCustomer> => {
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

	// Early return if customer already existed or no paid products
	if (autumnResult.type === "existing") {
		setCustomerCreationRecoveryStage({ ctx, stage: "completed" });
		return context.fullCustomer;
	}

	// ============ Phase 2: Create stripe customer / attach paid defaults ============

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

		// 4. Setup billing context (creates Stripe customer)

		const shouldCreateStripeCustomer =
			customerData?.create_in_stripe || context.hasPaidProducts;

		const shouldAttachPaidDefaults =
			context.hasPaidProducts &&
			!hasActivePaidSubscription({
				customerProducts: context.fullCustomer.customer_products,
			});

		if (!shouldCreateStripeCustomer) {
			setCustomerCreationRecoveryStage({ ctx, stage: "completed" });
			return context.fullCustomer;
		}

		const billingContext = await setupCreateCustomerBillingContext({
			ctx,
			context,
		});

		if (!shouldAttachPaidDefaults) {
			setCustomerCreationRecoveryStage({ ctx, stage: "completed" });
			return context.fullCustomer;
		}

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
		const fullCustomer = await finalizeCreateCustomer({
			ctx,
			context,
			autumnBillingPlan,
			stripeSubscription,
		});
		setCustomerCreationRecoveryStage({ ctx, stage: "completed" });
		return fullCustomer;
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
