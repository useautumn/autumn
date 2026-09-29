import { isPreviewStripeId, type StripeBillingPlan } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripePrice } from "@/external/stripe/prices/operations/getStripePrice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { scheduleActionToParams } from "../scheduleActionToParams";

const stripeBillingPlanToPriceIds = (
	stripeBillingPlan: StripeBillingPlan,
): string[] => {
	const {
		subscriptionAction,
		subscriptionScheduleAction,
		checkoutSessionAction,
	} = stripeBillingPlan;
	const subscriptionItems =
		subscriptionAction?.type === "create" ||
		subscriptionAction?.type === "update"
			? (subscriptionAction.params.items ?? [])
			: [];
	const scheduleItems = (
		scheduleActionToParams(subscriptionScheduleAction)?.phases ?? []
	).flatMap((phase) => phase.items);
	const checkoutItems = checkoutSessionAction?.params.line_items ?? [];

	return [...subscriptionItems, ...scheduleItems, ...checkoutItems].flatMap(
		(item) => (item.price ? [item.price] : []),
	);
};

/** Every real Stripe price the preview references, keyed by id. */
export const buildStripePriceLookup = async ({
	ctx,
	stripeBillingPlan,
	stripeSubscription,
}: {
	ctx: AutumnContext;
	stripeBillingPlan: StripeBillingPlan;
	stripeSubscription?: Stripe.Subscription;
}): Promise<Map<string, Stripe.Price>> => {
	const stripePrices = new Map<string, Stripe.Price>(
		(stripeSubscription?.items.data ?? []).map((liveItem) => [
			liveItem.price.id,
			liveItem.price,
		]),
	);

	const missingPriceIds = [
		...new Set(stripeBillingPlanToPriceIds(stripeBillingPlan)),
	].filter(
		(priceId) =>
			!stripePrices.has(priceId) && !isPreviewStripeId({ stripeId: priceId }),
	);
	if (missingPriceIds.length === 0) return stripePrices;

	const stripeClient = createStripeCli({ org: ctx.org, env: ctx.env });
	const fetchedPrices = await Promise.all(
		missingPriceIds.map((stripePriceId) =>
			getStripePrice({ stripeClient, stripePriceId, expand: ["tiers"] }),
		),
	);
	for (const stripePrice of fetchedPrices) {
		if (stripePrice) stripePrices.set(stripePrice.id, stripePrice);
	}

	return stripePrices;
};
