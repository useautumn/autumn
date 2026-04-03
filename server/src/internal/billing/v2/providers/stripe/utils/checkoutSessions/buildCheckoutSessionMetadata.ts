import type Stripe from "stripe";
import { mergeStripeMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/mergeStripeMetadata";

export const buildCheckoutSessionMetadata = ({
	userMetadata,
	paramsMetadata,
	checkoutSessionMetadata,
	autumnMetadataId,
}: {
	userMetadata?: Record<string, string>;
	paramsMetadata?: Stripe.MetadataParam;
	checkoutSessionMetadata?: Stripe.MetadataParam;
	autumnMetadataId?: string;
}) => {
	if (
		!userMetadata &&
		!paramsMetadata &&
		!checkoutSessionMetadata &&
		!autumnMetadataId
	) {
		return undefined;
	}

	return mergeStripeMetadata({
		userMetadata,
		autumnMetadata: {
			...(checkoutSessionMetadata ?? {}),
			...(paramsMetadata ?? {}),
			...(autumnMetadataId ? { autumn_metadata_id: autumnMetadataId } : {}),
		},
	});
};
