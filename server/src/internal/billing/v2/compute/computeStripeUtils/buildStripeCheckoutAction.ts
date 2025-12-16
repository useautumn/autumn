import {
	BillingInterval,
	cusProductsToPrices,
	type FullCusProduct,
	getLargestInterval,
	msToSeconds,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { toSuccessUrl } from "../../../../orgs/orgUtils/convertOrgUtils";
import { cusProductToStripeItemSpecs } from "../../../billingUtils/stripeAdapter/cusProductToStripeItemSpecs";
import type { AttachContext } from "../../types";
import { computeShouldCreateStripeCheckout } from "./computeShouldCreateStripeCheckout";

export const buildCheckoutSessionCreateSubscriptionData = ({
	isRecurring,
	trialEndsAt,
	// freeTrial,
	// billingCycleAnchorUnixSeconds,
}: {
	isRecurring: boolean;
	trialEndsAt?: number;
	// freeTrial: FreeTrial;
	// billingCycleAnchorUnixSeconds: number;
}): Stripe.Checkout.SessionCreateParams.SubscriptionData | undefined => {
	if (isRecurring && trialEndsAt) {
		return {
			trial_end: msToSeconds(trialEndsAt),
			trial_settings: {
				end_behavior: {
					missing_payment_method: "cancel",
				},
			},
		};
	}

	return undefined;
};

export const buildStripeCheckoutAction = ({
	ctx,
	attachContext,
	newCusProducts,
}: {
	ctx: AutumnContext;
	attachContext: AttachContext;
	newCusProducts: FullCusProduct[];
}) => {
	const { org, env } = ctx;
	const { body } = attachContext;

	const { shouldCreate, reason } = computeShouldCreateStripeCheckout({
		attachContext,
		newCusProducts,
	});

	// 1. Get largest interval
	const largestInterval = getLargestInterval({
		prices: cusProductsToPrices({ cusProducts: newCusProducts }),
	});

	// 2. Get params
	const stripeItemSpecs = newCusProducts.flatMap((cusProduct) =>
		cusProductToStripeItemSpecs({
			ctx,
			cusProduct,
			fromCheckout: true,
			fromVercel: attachContext.paymentMethod?.type === "custom",
			interval: largestInterval?.interval,
			intervalCount: largestInterval?.intervalCount,
		}),
	);

	// 3. Is recurring:
	const isRecurring = largestInterval?.interval !== BillingInterval.OneOff;
	const subscriptionData = buildCheckoutSessionCreateSubscriptionData({
		isRecurring,
		trialEndsAt: undefined, // TODO:
	});

	const metadata: Record<string, string> = {
		...(body.checkout_session_params?.metadata || {}),
	};

	// 4. Build checkout session params
	const checkoutSessionCreateParams: Stripe.Checkout.SessionCreateParams = {
		success_url: toSuccessUrl({ org, env }),
		subscription_data: subscriptionData,
		mode: isRecurring ? "subscription" : "payment",
		line_items: stripeItemSpecs.map((item) => ({
			price: item.stripePriceId,
			quantity: item.quantity,
		})),
		metadata,
	};

	return {
		shouldCreate,
		reason,
		params: checkoutSessionCreateParams,
	};
};

// let billingCycleAnchorUnixSeconds = org.config.anchor_start_of_month
// ? Math.floor(
//     getNextStartOfMonthUnix({
//       interval: itemSets[0].interval,
//       intervalCount: itemSets[0].intervalCount,
//     }) / 1000,
//   )
// : undefined;

// if (attachParams.billingAnchor) {
// billingCycleAnchorUnixSeconds = Math.floor(
//   attachParams.billingAnchor / 1000,
// );
// }
