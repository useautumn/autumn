import { isPreviewStripeId, type ProcessorItem } from "@autumn/shared";
import type Stripe from "stripe";
import { isFreePhasePlaceholderItem } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/buildStripePhasesUpdate";
import type { InlinePriceData } from "./price/inlinePriceDataToProcessorItemPrice";
import { processorItemAmount } from "./price/processorItemAmount";
import { resolveProcessorItemPrice } from "./price/resolveProcessorItemPrice";
import type { AutumnStripePriceIndex } from "./types/autumnStripePriceIndex";
import type { ProcessorItemContext } from "./types/processorItemContext";

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

const FALLBACK_DISPLAY_NAME = "Stripe item";

/** Names an item after the Autumn plan it bills for and describes how Stripe charges it. */
export const toProcessorItem = ({
	itemId = null,
	stripePriceId,
	inlinePriceData,
	metadata,
	quantity,
	fallbackName,
	context,
}: {
	itemId?: string | null;
	stripePriceId?: string;
	inlinePriceData?: InlinePriceData;
	metadata?: StripeItemMetadata;
	quantity?: number | null;
	fallbackName?: string | null;
	context: ProcessorItemContext;
}): ProcessorItem => {
	const autumnStripePrice = findAutumnStripePrice({
		priceIndex: context.priceIndex,
		stripePriceId,
		metadata,
	});
	const price = resolveProcessorItemPrice({
		stripePriceId,
		inlinePriceData,
		autumnStripePrice,
		context,
	});
	const itemQuantity = quantity ?? null;

	return {
		item_id: itemId,
		price_id: stripePriceId ?? null,
		plan_id: autumnStripePrice?.planId ?? null,
		feature_id: autumnStripePrice?.featureId ?? null,
		display_name:
			autumnStripePrice?.planName ??
			fallbackName ??
			stripePriceId ??
			FALLBACK_DISPLAY_NAME,
		feature_name: autumnStripePrice?.featureName ?? null,
		quantity: itemQuantity,
		price,
		amount: processorItemAmount({ price, quantity: itemQuantity }),
		creates_price:
			inlinePriceData !== undefined ||
			isPreviewStripeId({ stripeId: stripePriceId }),
		managed_by_autumn:
			autumnStripePrice !== undefined ||
			isFreePhasePlaceholderItem({ metadata }),
	};
};
