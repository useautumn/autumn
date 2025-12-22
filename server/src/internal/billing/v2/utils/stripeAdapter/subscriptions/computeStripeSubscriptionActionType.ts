// import type Stripe from "stripe";
// import type { AutumnContext } from "@/honoUtils/HonoEnv";
// import type { BillingContext } from "@/internal/billing/v2/billingContext";
// import type { FreeTrialPlan } from "@/internal/billing/v2/billingPlan";

// export const computeStripeSubscriptionActionType = ({
// 	ctx,
// 	billingContext,
// 	subItemsUpdate,
// 	freeTrialPlan,
// }: {
// 	ctx: AutumnContext;
// 	billingContext: BillingContext;
// 	subItemsUpdate: Stripe.SubscriptionUpdateParams.Item[];
// 	freeTrialPlan?: FreeTrialPlan;
// }) => {
// 	const { stripeSubscription } = billingContext;

// 	// Case 1: No subscription and sub items update is empty -> no action
// 	if (!stripeSubscription && subItemsUpdate.length === 0) return undefined;

// 	// Case 2: No subscription and sub items update not empty -> create subscription
// 	if (!stripeSubscription && subItemsUpdate.length > 0) {
// 		return "create";
// 	}

// 	// Case 3: Cancel subscription
// 	if (
// 		subItemsUpdate.length === stripeSubscription?.items.data.length &&
// 		subItemsUpdate.every((item) => item.deleted)
// 	) {
// 		return "cancel";
// 	}

// 	if (stripeSubscription) {
// 		return "update";
// 	}

// 	return undefined;
// };
