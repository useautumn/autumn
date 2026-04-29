import { hasCustomerProductStarted } from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

const getScheduleId = ({
	subscription,
}: {
	subscription: Stripe.Subscription;
}) =>
	typeof subscription.schedule === "string"
		? subscription.schedule
		: subscription.schedule?.id;

export const linkScheduledCustomerProductsToSubscription = async ({
	ctx,
	subscription,
}: {
	ctx: StripeWebhookContext;
	subscription: Stripe.Subscription;
}) => {
	const scheduleId = getScheduleId({ subscription });
	if (!scheduleId) return;

	const { db, org, env, logger } = ctx;
	const cusProducts = await CusProductService.getByStripeScheduledId({
		db,
		stripeScheduledId: scheduleId,
		orgId: org.id,
		env,
	});

	let updatedCount = 0;
	for (const cusProduct of cusProducts) {
		const subscriptionIds = cusProduct.subscription_ids ?? [];
		if (subscriptionIds.includes(subscription.id)) continue;

		const nextSubscriptionIds = [...subscriptionIds, subscription.id];
		const shouldActivate =
			ctx.fullCustomer &&
			hasCustomerProductStarted(cusProduct, {
				nowMs: (subscription.start_date ?? subscription.created) * 1000,
			});

		if (shouldActivate) {
			await customerProductActions.activateScheduled({
				ctx,
				customerProduct: cusProduct,
				fullCustomer: ctx.fullCustomer!,
				subscriptionIds: nextSubscriptionIds,
				scheduledIds: cusProduct.scheduled_ids ?? [scheduleId],
			});
			updatedCount++;
			continue;
		}

		await CusProductService.update({
			ctx,
			cusProductId: cusProduct.id,
			updates: {
				subscription_ids: nextSubscriptionIds,
			},
		});
		updatedCount++;
	}

	if (updatedCount > 0) {
		logger.info(
			`[sub.created] linked ${updatedCount} scheduled customer product(s) to subscription ${subscription.id}`,
		);
	}
};
