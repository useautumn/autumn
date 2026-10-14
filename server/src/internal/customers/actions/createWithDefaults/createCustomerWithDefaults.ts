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

export const createCustomerWithDefaults = async ({
	ctx,
	customerId,
	customerData,
}: {
	ctx: AutumnContext;
	customerId: string | null;
	customerData?: CustomerData;
}): Promise<FullCustomer> => {
	if (customerId) await assertCustomerCreateWithinOrgLimit({ ctx });
	setCustomerCreationRecoveryStage({ ctx, stage: "pre_commit" });

	const context = await setupCreateCustomer({
		ctx,
		customerId,
		customerData,
	});

	logCreateCustomerContext({ ctx, context });

	const autumnBillingPlan = computeCreateCustomerPlan({ ctx, context });

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

	try {
		context.fullCustomer = await syncCreatedCustomerFromStripe({
			ctx,
			fullCustomer: context.fullCustomer,
			stripeCustomerId: customerData?.stripe_id,
		});

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

		void sendBillingUpdatedWebhook({
			ctx,
			autumnBillingPlan,
			originalFullCustomer: context.fullCustomer,
		});
	}
};
