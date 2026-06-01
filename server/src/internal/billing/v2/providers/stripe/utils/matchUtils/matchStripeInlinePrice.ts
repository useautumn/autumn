import type { StripeItemSpec } from "@autumn/shared";
import type Stripe from "stripe";
import {
	inlinePriceToShape,
	stripePriceShapesEqual,
	stripePriceToShape,
} from "./stripePriceShape";

type PhaseItem = NonNullable<
	Stripe.SubscriptionScheduleUpdateParams.Phase["items"]
>[number];
type InlinePriceForMatch =
	| NonNullable<StripeItemSpec["stripeInlinePrice"]>
	| NonNullable<PhaseItem["price_data"]>;

const autumnCustomerPriceId = ({
	metadata,
}: {
	metadata?: Stripe.MetadataParam | Stripe.Metadata;
}) => {
	const id = metadata?.autumn_customer_price_id;
	return typeof id === "string" ? id : undefined;
};

const autumnPriceId = ({
	metadata,
}: {
	metadata?: Stripe.MetadataParam | Stripe.Metadata;
}) => {
	const id = metadata?.autumn_price_id;
	return typeof id === "string" ? id : undefined;
};

export const stripeInlinePriceMatchesStripePrice = ({
	inlinePrice,
	stripePrice,
}: {
	inlinePrice: InlinePriceForMatch | PhaseItem["price_data"];
	stripePrice: Stripe.Price;
}) => {
	if (!inlinePrice) return false;

	return stripePriceShapesEqual(
		inlinePriceToShape({ price: inlinePrice }),
		stripePriceToShape({ price: stripePrice }),
	);
};

export const findMatchingInlineSubscriptionItem = ({
	inlinePrice,
	metadata,
	subscriptionItems,
	usedSubscriptionItemIds,
}: {
	inlinePrice: InlinePriceForMatch;
	metadata?: Stripe.MetadataParam | Stripe.Metadata;
	subscriptionItems: Stripe.SubscriptionItem[];
	usedSubscriptionItemIds: Set<string>;
}) => {
	const customerPriceId = autumnCustomerPriceId({ metadata });
	const priceId = autumnPriceId({ metadata });

	const shapeMatches = (subscriptionItem: Stripe.SubscriptionItem) =>
		stripeInlinePriceMatchesStripePrice({
			inlinePrice,
			stripePrice: subscriptionItem.price,
		});

	if (customerPriceId) {
		const match = subscriptionItems.find((subscriptionItem) => {
			if (usedSubscriptionItemIds.has(subscriptionItem.id)) return false;
			if (
				subscriptionItem.metadata.autumn_customer_price_id !== customerPriceId
			) {
				return false;
			}

			return shapeMatches(subscriptionItem);
		});

		if (match) return match;
	}

	if (!priceId) return undefined;

	const fallbackMatches = subscriptionItems.filter((subscriptionItem) => {
		if (usedSubscriptionItemIds.has(subscriptionItem.id)) return false;
		if (subscriptionItem.metadata.autumn_customer_price_id) return false;
		if (subscriptionItem.metadata.autumn_price_id !== priceId) return false;

		return shapeMatches(subscriptionItem);
	});

	return fallbackMatches.length === 1 ? fallbackMatches[0] : undefined;
};

export const findMatchingInlinePriceIdForPhaseItem = ({
	phaseItem,
	stripeSubscription,
	usedSubscriptionItemIds,
}: {
	phaseItem: PhaseItem;
	stripeSubscription?: Stripe.Subscription;
	usedSubscriptionItemIds: Set<string>;
}) => {
	if (!stripeSubscription || !phaseItem.price_data) return undefined;

	const matchingItem = findMatchingInlineSubscriptionItem({
		inlinePrice: phaseItem.price_data,
		metadata: phaseItem.metadata,
		subscriptionItems: stripeSubscription.items.data,
		usedSubscriptionItemIds,
	});

	if (matchingItem) {
		usedSubscriptionItemIds.add(matchingItem.id);
	}

	return matchingItem?.price.id;
};
