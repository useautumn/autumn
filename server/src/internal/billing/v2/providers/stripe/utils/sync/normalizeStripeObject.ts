import type Stripe from "stripe";

export type NormalizedStripeSyncCandidate = {
	stripePriceId: string | null;
	stripeProductId: string | null;
	metadata: Stripe.Metadata;
	quantity: number | null;
};

const normalizeStripeProductId = ({
	product,
}: {
	product: string | Stripe.Product | Stripe.DeletedProduct | null | undefined;
}): string | null => {
	if (!product) return null;
	return typeof product === "string" ? product : (product.id ?? null);
};

export const normalizeStripeSubscriptionItem = ({
	stripeItem,
}: {
	stripeItem: Stripe.SubscriptionItem;
}): NormalizedStripeSyncCandidate => {
	return {
		stripePriceId: stripeItem.price?.id ?? null,
		stripeProductId: normalizeStripeProductId({
			product: stripeItem.price?.product,
		}),
		metadata: stripeItem.metadata ?? {},
		quantity: stripeItem.quantity ?? null,
	};
};

export const normalizeStripePhaseItem = ({
	phaseItem,
}: {
	phaseItem: Stripe.SubscriptionSchedule.Phase.Item;
}): NormalizedStripeSyncCandidate => {
	// Stripe types `phaseItem.price` as `string | Stripe.Price`. Handle both:
	// when expanded it's a Price object; when unexpanded it's a raw price ID.
	const phaseItemPrice = phaseItem.price as string | Stripe.Price | undefined;
	const expandedPrice =
		typeof phaseItemPrice === "object" ? phaseItemPrice : undefined;
	const stripePriceId =
		typeof phaseItemPrice === "string"
			? phaseItemPrice
			: (expandedPrice?.id ?? null);

	return {
		stripePriceId,
		stripeProductId: normalizeStripeProductId({
			product: expandedPrice?.product,
		}),
		metadata: {},
		quantity: phaseItem.quantity ?? null,
	};
};

export const normalizeStripeCheckoutLineItem = ({
	checkoutLineItem,
}: {
	checkoutLineItem: Stripe.LineItem;
}): NormalizedStripeSyncCandidate => {
	return {
		stripePriceId: checkoutLineItem.price?.id ?? null,
		stripeProductId: normalizeStripeProductId({
			product: checkoutLineItem.price?.product,
		}),
		metadata: checkoutLineItem.metadata ?? {},
		quantity: checkoutLineItem.quantity ?? null,
	};
};

export const normalizeStripePrice = ({
	stripePrice,
}: {
	stripePrice: Stripe.Price;
}): NormalizedStripeSyncCandidate => {
	return {
		stripePriceId: stripePrice.id ?? null,
		stripeProductId:
			typeof stripePrice.product === "string"
				? stripePrice.product
				: ((stripePrice.product as Stripe.Product | undefined)?.id ?? null),
		metadata: {},
		quantity: null,
	};
};
