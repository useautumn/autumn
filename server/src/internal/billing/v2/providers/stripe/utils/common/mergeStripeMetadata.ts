import type Stripe from "stripe";

const AUTUMN_METADATA_PREFIX = "autumn_";

/** Merges user-provided metadata with Autumn's internal metadata, filtering reserved `autumn_*` keys. */
export const mergeStripeMetadata = ({
	userMetadata,
	autumnMetadata,
}: {
	userMetadata?: Record<string, string>;
	autumnMetadata?: Stripe.MetadataParam;
}): Stripe.MetadataParam | undefined => {
	if (!userMetadata && !autumnMetadata) return undefined;

	const safeUserMetadata: Stripe.MetadataParam = {};
	if (userMetadata) {
		for (const [key, value] of Object.entries(userMetadata)) {
			if (!key.startsWith(AUTUMN_METADATA_PREFIX)) {
				safeUserMetadata[key] = value;
			}
		}
	}

	return {
		...safeUserMetadata,
		...(autumnMetadata ?? {}),
	};
};
