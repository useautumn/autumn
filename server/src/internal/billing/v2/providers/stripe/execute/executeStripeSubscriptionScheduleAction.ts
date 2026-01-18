import { createStripeCli } from "@server/external/connect/createStripeCli";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type { BillingContext } from "@server/internal/billing/v2/billingContext";
import type Stripe from "stripe";
import { logSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/logSubscriptionScheduleAction";
import type { StripeSubscriptionScheduleAction } from "@/internal/billing/v2/types/billingPlan";

/**
 * Maps update phase format to create phase format.
 */
const toCreatePhase = (
	phase: Stripe.SubscriptionScheduleUpdateParams.Phase,
): Stripe.SubscriptionScheduleCreateParams.Phase => ({
	items: phase.items?.map((item) => ({
		price: item.price,
		quantity: item.quantity,
	})),
	end_date: typeof phase.end_date === "number" ? phase.end_date : undefined,
});

export const executeStripeSubscriptionScheduleAction = async ({
	ctx,
	billingContext,
	subscriptionScheduleAction,
	stripeSubscription,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	subscriptionScheduleAction: StripeSubscriptionScheduleAction;
	stripeSubscription?: Stripe.Subscription;
}): Promise<Stripe.SubscriptionSchedule> => {
	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	ctx.logger.debug(
		`[executeStripeSubscriptionScheduleAction] Executing subscription schedule operation: ${subscriptionScheduleAction.type}`,
	);

	// Log phases
	logSubscriptionScheduleAction({
		ctx,
		billingContext,
		subscriptionScheduleAction,
	});

	switch (subscriptionScheduleAction.type) {
		case "create": {
			const { params } = subscriptionScheduleAction;

			// If there's an existing subscription, create from it first then update with phases
			if (stripeSubscription) {
				const schedule = await stripeCli.subscriptionSchedules.create({
					from_subscription: stripeSubscription.id,
				});

				const newSchedule = await stripeCli.subscriptionSchedules.update(
					schedule.id,
					{
						phases: params.phases,
						end_behavior: params.end_behavior,
					},
				);

				return newSchedule;
			}

			// No subscription - create standalone schedule
			return await stripeCli.subscriptionSchedules.create({
				customer: billingContext.stripeCustomer.id,
				phases: params.phases?.map(toCreatePhase) ?? [],
				end_behavior: params.end_behavior,
			});
		}

		case "update":
			return await stripeCli.subscriptionSchedules.update(
				subscriptionScheduleAction.stripeSubscriptionScheduleId,
				subscriptionScheduleAction.params,
			);

		case "release":
			return await stripeCli.subscriptionSchedules.release(
				subscriptionScheduleAction.stripeSubscriptionScheduleId,
			);
	}
};
