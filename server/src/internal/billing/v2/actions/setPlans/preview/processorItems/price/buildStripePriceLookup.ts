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

/** Subscriptions are fetched without price tiers, so a tiered live price is refetched with them. */
const hasBillingDetail = (price: Stripe.Price) =>
	price.billing_scheme !== "tiered" || price.tiers !== undefined;

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
	const livePrices = (stripeSubscription?.items.data ?? []).map(
		(liveItem) => liveItem.price,
	);
	const stripePrices = new Map<string, Stripe.Price>(
		livePrices
			.filter(hasBillingDetail)
			.map((livePrice) => [livePrice.id, livePrice]),
	);

	const missingPriceIds = [
		...new Set([
			...livePrices.map((livePrice) => livePrice.id),
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
			getStripePrice({ stripeClient, stripePriceId, expand: ["tiers"] }),
		),
	);
	for (const stripePrice of fetchedPrices) {
		if (stripePrice) stripePrices.set(stripePrice.id, stripePrice);
	}

	return stripePrices;
};
