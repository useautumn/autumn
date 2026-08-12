import type { DrizzleCli } from "@/db/initDrizzle.js";
import { queryRelationshipRedemptions } from "./queryRelationshipRedemptions.js";

/** Find redemptions where the given customer is the referrer */
export const getRedemptionsByReferrer = async ({
	db,
	internalCustomerId,
	withRewardProgram = false,
	limit = 100,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	withRewardProgram?: boolean;
	limit?: number;
}) => {
	const data = await queryRelationshipRedemptions({
		db,
		internalCustomerId,
		direction: "referrer",
		withRewardProgram,
		limit,
	});

	return data.map((d) => ({
		...d,
		customer: d.related_customer,
	}));
};
