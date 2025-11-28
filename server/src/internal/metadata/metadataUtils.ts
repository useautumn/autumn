import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { MetadataService } from "./MetadataService.js";

export const getMetadataFromCheckoutSession = async (
	checkoutSession: Stripe.Checkout.Session,
	db: DrizzleCli,
) => {
	const metadataId = checkoutSession.metadata?.autumn_metadata_id;

	if (!metadataId) {
		return null;
	}

	const metadata = await MetadataService.get({
		db,
		id: metadataId,
	});

	if (!metadata) {
		return null;
	}

	return metadata;
};
