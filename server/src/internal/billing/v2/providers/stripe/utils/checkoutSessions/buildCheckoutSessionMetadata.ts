import type Stripe from "stripe";

export const buildCheckoutSessionMetadata = ({
	paramsMetadata,
	checkoutSessionMetadata,
	autumnMetadataId,
}: {
	paramsMetadata?: Stripe.MetadataParam;
	checkoutSessionMetadata?: Stripe.MetadataParam;
	autumnMetadataId?: string;
}) => {
	if (!paramsMetadata && !checkoutSessionMetadata && !autumnMetadataId) {
		return undefined;
	}

	return {
		...(checkoutSessionMetadata ?? {}),
		...(paramsMetadata ?? {}),
		...(autumnMetadataId
			? {
					autumn_metadata_id: autumnMetadataId,
				}
			: {}),
	} satisfies Stripe.MetadataParam;
};
