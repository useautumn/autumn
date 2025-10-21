import type { AutumnMetadata } from "@autumn/shared";
import { addDays } from "date-fns";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import type { AttachParams } from "../customers/cusProducts/AttachParams.js";
import { MetadataService } from "./MetadataService.js";

export const createCheckoutMetadata = async ({
	db,
	attachParams,
}: {
	db: DrizzleCli;
	attachParams: AttachParams;
}) => {
	const metaId = generateId("meta");

	const {
		req: _req,
		checkoutSessionParams: _checkoutSessionParams,
		stripeCli: _stripeCli,
		paymentMethod: _paymentMethod,
		...rest
	} = attachParams;

	const attachClone = structuredClone(rest);

	const metadata: AutumnMetadata = {
		id: metaId,
		created_at: Date.now(),
		expires_at: addDays(Date.now(), 10).getTime(), // 10 days
		data: {
			...attachClone,
		},
	};

	await MetadataService.insert({ db, data: metadata });

	return metaId;
};

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
