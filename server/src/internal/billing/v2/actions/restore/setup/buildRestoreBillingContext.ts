import {
	type BillingContext,
	BillingVersion,
	type FullCustomer,
	InternalError,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripeActiveSubscriptionSchedule } from "@/external/stripe/subscriptionSchedules/index";
import { isStripeSubscriptionCanceled } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { stripeSubscriptionToScheduleId } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const buildRestoreBillingContext = async ({
	ctx,
	fullCustomer,
	stripeCustomer,
	stripeSubscriptionId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	stripeCustomer?: Stripe.Customer;
	stripeSubscriptionId: string;
}): Promise<BillingContext> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const stripeSubscription = await stripeCli.subscriptions.retrieve(
		stripeSubscriptionId,
		{ expand: ["discounts.source.coupon.applies_to"] },
	);

	if (isStripeSubscriptionCanceled(stripeSubscription)) {
		throw new InternalError({
			message: `[Restore] Stripe subscription is canceled: ${stripeSubscriptionId}`,
		});
	}

	const scheduleId = stripeSubscriptionToScheduleId({ stripeSubscription });

	const stripeSubscriptionSchedule = scheduleId
		? await getStripeActiveSubscriptionSchedule({
				stripeClient: stripeCli,
				subscriptionScheduleId: scheduleId,
			})
		: undefined;

	return {
		fullCustomer,
		fullProducts: [],
		featureQuantities: [],
		currentEpochMs: Date.now(),
		billingCycleAnchorMs: secondsToMs(stripeSubscription.billing_cycle_anchor),
		resetCycleAnchorMs: "now",

		stripeCustomer,
		stripeSubscription,
		stripeSubscriptionSchedule,

		billingVersion: BillingVersion.V2,
		actionSource: "restore",
	};
};
