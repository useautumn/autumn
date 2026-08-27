import { features } from "@autumn/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const updateFeatureStripeProductIdIfUnset = async ({
	db,
	featureInternalId,
	newId,
	previousId,
}: {
	db: DrizzleCli;
	featureInternalId: string;
	newId: string;
	previousId?: string | null;
}) => {
	const previous = previousId ?? null;
	await db
		.update(features)
		.set({ stripe_product_id: newId })
		.where(
			and(
				eq(features.internal_id, featureInternalId),
				previous === null
					? isNull(features.stripe_product_id)
					: eq(features.stripe_product_id, previous),
			),
		);
};
