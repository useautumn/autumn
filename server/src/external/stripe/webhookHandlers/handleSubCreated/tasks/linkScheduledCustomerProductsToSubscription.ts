import { hasCustomerProductStarted, secondsToMs } from "@autumn/shared";
import type Stripe from "stripe";
import { stripeSubscriptionToScheduleId } from "@/external/stripe/subscriptions";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

export const linkScheduledCustomerProductsToSubscription = async ({
	ctx,
	subscription,
}: {
	ctx: StripeWebhookContext;
	subscription: Stripe.Subscription;
}) => {
	const scheduleId = stripeSubscriptionToScheduleId({
		stripeSubscription: subscription,
	});
	if (!scheduleId) return;

	const { db, org, env, logger } = ctx;
	const cusProducts = await CusProductService.getByStripeScheduledId({
		db,
		stripeScheduledId: scheduleId,
		orgId: org.id,
		env,
	});

	const subscriptionStartMs = secondsToMs(
		subscription.start_date ?? subscription.created,
	);

	let linkedCount = 0;

	for (const cusProduct of cusProducts) {
		const subscriptionIds = cusProduct.subscription_ids ?? [];
		if (subscriptionIds.includes(subscription.id)) continue;

		const nextSubscriptionIds = [...subscriptionIds, subscription.id];
		const hasStarted = hasCustomerProductStarted(cusProduct, {
			nowMs: subscriptionStartMs,
		});

		if (hasStarted && ctx.fullCustomer) {
			await customerProductActions.activateScheduled({
				ctx,
				customerProduct: cusProduct,
				fullCustomer: ctx.fullCustomer,
				subscriptionIds: nextSubscriptionIds,
				scheduledIds: cusProduct.scheduled_ids?.length
					? cusProduct.scheduled_ids
					: [scheduleId],
			});
			linkedCount++;
			continue;
		}

		if (hasStarted) {
			logger.warn(
				`[sub.created] could not activate scheduled customer product ${cusProduct.id}: fullCustomer missing`,
			);
			continue;
		}

		await CusProductService.update({
			ctx,
			cusProductId: cusProduct.id,
			updates: {
				subscription_ids: nextSubscriptionIds,
			},
		});
		linkedCount++;
	}

	if (linkedCount > 0) {
		logger.info(
			`[sub.created] linked ${linkedCount} scheduled customer product(s) to subscription ${subscription.id}`,
		);
	}
};
