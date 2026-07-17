import type { AutumnBillingPlan } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { mergeAutumnBillingPlans } from "@/internal/billing/v2/utils/billingPlan/mergeAutumnBillingPlans.js";
import type { PreparedScheduledCustomerProductActivation } from "@/internal/customers/cusProducts/actions/activateScheduled.js";
import type { PreparedCustomerProductExpiry } from "@/internal/customers/cusProducts/actions/expireAndActivateDefault.js";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext.js";
import {
	completeScheduledCustomerProducts,
	prepareScheduledCustomerProducts,
} from "./activateScheduledCustomerProducts.js";
import {
	completeEndedCustomerProducts,
	prepareEndedCustomerProducts,
} from "./expireEndedCustomerProducts.js";

export const buildSchedulePhaseTransitionPlan = ({
	customerId,
	preparedActivations,
	preparedExpirations,
}: {
	customerId: string;
	preparedActivations: PreparedScheduledCustomerProductActivation[];
	preparedExpirations: PreparedCustomerProductExpiry[];
}): AutumnBillingPlan => {
	let transitionPlan: AutumnBillingPlan = {
		customerId,
		insertCustomerProducts: [],
	};

	for (const preparedTransition of [
		...preparedActivations,
		...preparedExpirations,
	]) {
		transitionPlan = mergeAutumnBillingPlans({
			base: transitionPlan,
			incoming: preparedTransition.autumnBillingPlan,
		});
	}

	return transitionPlan;
};

export const transitionSchedulePhaseCustomerProducts = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const preparedActivations = await prepareScheduledCustomerProducts({
		ctx,
		eventContext,
	});
	const preparedExpirations = await prepareEndedCustomerProducts({
		ctx,
		eventContext,
	});

	if (preparedActivations.length > 0 || preparedExpirations.length > 0) {
		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: buildSchedulePhaseTransitionPlan({
				customerId:
					eventContext.fullCustomer.id || eventContext.fullCustomer.internal_id,
				preparedActivations,
				preparedExpirations,
			}),
		});
	}

	await completeScheduledCustomerProducts({
		ctx,
		eventContext,
		preparedActivations,
	});
	await completeEndedCustomerProducts({
		ctx,
		eventContext,
		preparedExpirations,
	});
};
