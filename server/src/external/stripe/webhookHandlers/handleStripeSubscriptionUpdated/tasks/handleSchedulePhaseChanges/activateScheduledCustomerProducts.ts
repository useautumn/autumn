import {
	cp,
	hasCustomerProductStarted,
	isCustomerProductFree,
	isCustomerProductOnStripeSubscriptionSchedule,
} from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import {
	completeScheduledCustomerProductActivation,
	type PreparedScheduledCustomerProductActivation,
	prepareScheduledCustomerProductActivation,
} from "@/internal/customers/cusProducts/actions/activateScheduled.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import { trackCustomerProductUpdate } from "../../../common/trackCustomerProductUpdate.js";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext.js";

export const prepareScheduledCustomerProducts = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}): Promise<PreparedScheduledCustomerProductActivation[]> => {
	const { logger } = ctx;
	const { fullCustomer, stripeSubscription, nowMs } = eventContext;
	const preparedActivations: PreparedScheduledCustomerProductActivation[] = [];
	const stripeSubscriptionSchedule = stripeSubscription.schedule;

	for (const customerProduct of fullCustomer.customer_products) {
		const hasStarted = hasCustomerProductStarted(customerProduct, { nowMs });
		const canActivate = cp(customerProduct)
			.free()
			.or.onStripeSubscription({ stripeSubscriptionId: stripeSubscription.id })
			.or.onStripeSchedule({
				stripeSubscriptionScheduleId: stripeSubscriptionSchedule?.id ?? "",
			}).valid;

		addToExtraLogs({
			ctx,
			extras: {
				[Date.now().toString()]: {
					product: customerProduct.product.name,
					canActivate,
					hasStarted,
				},
			},
		});

		if (!canActivate || !hasStarted) continue;

		const isFree = isCustomerProductFree(customerProduct);

		logger.info(
			`Activating scheduled product: ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
		);

		const subscriptionIds = isFree ? [] : [stripeSubscription.id];
		const scheduledIds = isFree
			? []
			: stripeSubscriptionSchedule &&
					isCustomerProductOnStripeSubscriptionSchedule({
						customerProduct,
						stripeSubscriptionScheduleId: stripeSubscriptionSchedule.id,
					})
				? [stripeSubscriptionSchedule.id]
				: [];

		preparedActivations.push(
			await prepareScheduledCustomerProductActivation({
				ctx,
				customerProduct,
				fullCustomer,
				subscriptionIds,
				scheduledIds,
				currentEpochMs: nowMs,
			}),
		);
	}

	return preparedActivations;
};

export const completeScheduledCustomerProducts = async ({
	ctx,
	eventContext,
	preparedActivations,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
	preparedActivations: PreparedScheduledCustomerProductActivation[];
}): Promise<void> => {
	for (const preparedActivation of preparedActivations) {
		await completeScheduledCustomerProductActivation({
			ctx,
			customerProduct: preparedActivation.customerProduct,
			fullCustomer: eventContext.fullCustomer,
		});

		trackCustomerProductUpdate({
			eventContext,
			customerProduct: preparedActivation.customerProduct,
			updates: preparedActivation.updates,
		});
	}
};

/** Activates scheduled products whose start time and subscription ownership match. */
export const activateScheduledCustomerProducts = async ({
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

	for (const preparedActivation of preparedActivations) {
		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: preparedActivation.autumnBillingPlan,
		});
	}

	await completeScheduledCustomerProducts({
		ctx,
		eventContext,
		preparedActivations,
	});
};
