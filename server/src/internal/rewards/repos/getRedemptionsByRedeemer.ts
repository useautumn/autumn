import type { DrizzleCli } from "@/db/initDrizzle.js";
import { queryRelationshipRedemptions } from "./queryRelationshipRedemptions.js";

/** Find redemptions where the given customer is the redeemer */
export const getRedemptionsByRedeemer = async ({
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
		direction: "redeemer",
		withRewardProgram,
		limit,
	});

	return data.map(({ related_customer, ...d }) => ({
		...d,
		referrer: related_customer,
	}));
};
