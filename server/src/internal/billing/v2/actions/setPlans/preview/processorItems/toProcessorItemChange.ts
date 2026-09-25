import { isPreviewStripeId, type ProcessorItemChange } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnStripePriceIndex } from "./types/autumnStripePriceIndex";

type StripeItemMetadata = Stripe.Emptyable<Stripe.MetadataParam> | undefined;

const findAutumnStripePrice = ({
	priceIndex,
	stripePriceId,
	metadata,
}: {
	priceIndex: AutumnStripePriceIndex;
	stripePriceId?: string;
	metadata?: StripeItemMetadata;
}) => {
	const autumnPriceId = metadata ? metadata.autumn_price_id : undefined;
	const byAutumnPriceId =
		typeof autumnPriceId === "string"
			? priceIndex.byAutumnPriceId.get(autumnPriceId)
			: undefined;

	return (
		byAutumnPriceId ??
		(stripePriceId ? priceIndex.byStripePriceId.get(stripePriceId) : undefined)
	);
};

const isFreePhasePlaceholder = (metadata?: StripeItemMetadata) =>
	metadata ? metadata.autumn_free_phase_placeholder === "true" : false;

export const toProcessorItemChange = ({
	action,
	itemId = null,
	stripePriceId,
	inlinePrice = false,
	metadata,
	quantity,
	previousQuantity,
	fallbackName,
	priceIndex,
}: {
	action: ProcessorItemChange["action"];
	itemId?: string | null;
	stripePriceId?: string;
	inlinePrice?: boolean;
	metadata?: StripeItemMetadata;
	quantity?: number | null;
	previousQuantity?: number | null;
	fallbackName?: string | null;
	priceIndex: AutumnStripePriceIndex;
}): ProcessorItemChange => {
	const autumnStripePrice = findAutumnStripePrice({
		priceIndex,
		stripePriceId,
		metadata,
	});

	return {
		action,
		item_id: itemId,
		price_id: stripePriceId ?? null,
		plan_id: autumnStripePrice?.planId ?? null,
		feature_id: autumnStripePrice?.featureId ?? null,
		display_name:
			autumnStripePrice?.displayName ??
			fallbackName ??
			stripePriceId ??
			"Stripe item",
		quantity: quantity ?? null,
		previous_attributes:
			previousQuantity === undefined ? null : { quantity: previousQuantity },
		creates_price:
			inlinePrice || isPreviewStripeId({ stripeId: stripePriceId }),
		managed_by_autumn:
			autumnStripePrice !== undefined || isFreePhasePlaceholder(metadata),
	};
};
