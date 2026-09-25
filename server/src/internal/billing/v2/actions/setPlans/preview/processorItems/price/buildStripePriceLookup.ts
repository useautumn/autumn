import { isPreviewStripeId, type StripeBillingPlan } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripePrice } from "@/external/stripe/prices/operations/getStripePrice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const TIERS_EXPAND = ["tiers"];

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
	const scheduleItems =
		subscriptionScheduleAction?.type === "create" ||
		subscriptionScheduleAction?.type === "update"
			? (subscriptionScheduleAction.params.phases ?? []).flatMap(
					(phase) => phase.items,
				)
			: [];
	const checkoutItems = checkoutSessionAction?.params.line_items ?? [];

	return [...subscriptionItems, ...scheduleItems, ...checkoutItems].flatMap(
		(item) => (item.price ? [item.price] : []),
	);
};

/** Live prices lack tiers unless expanded, so tiered ones are refetched. */
const isCompleteStripePrice = (stripePrice: Stripe.Price) =>
	stripePrice.billing_scheme !== "tiered" || stripePrice.tiers !== undefined;

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
	const stripePrices = new Map<string, Stripe.Price>();
	for (const liveItem of stripeSubscription?.items.data ?? []) {
		if (isCompleteStripePrice(liveItem.price)) {
			stripePrices.set(liveItem.price.id, liveItem.price);
		}
	}

	const liveIncompletePriceIds = (stripeSubscription?.items.data ?? [])
		.map((liveItem) => liveItem.price.id)
		.filter((priceId) => !stripePrices.has(priceId));
	const missingPriceIds = [
		...new Set([
			...liveIncompletePriceIds,
			...stripeBillingPlanToPriceIds(stripeBillingPlan),
		]),
	].filter(
		(priceId) =>
			!stripePrices.has(priceId) && !isPreviewStripeId({ stripeId: priceId }),
	);
	if (missingPriceIds.length === 0) return stripePrices;

	const stripeClient = createStripeCli({ org: ctx.org, env: ctx.env });
	const fetchedPrices = await Promise.all(
		missingPriceIds.map((stripePriceId) =>
			getStripePrice({ stripeClient, stripePriceId, expand: TIERS_EXPAND }),
		),
	);
	for (const stripePrice of fetchedPrices) {
		if (stripePrice) stripePrices.set(stripePrice.id, stripePrice);
	}

	return stripePrices;
};
