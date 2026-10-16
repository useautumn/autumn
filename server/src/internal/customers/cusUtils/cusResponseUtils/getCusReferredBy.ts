import {
	ApiCusReferredBySchema,
	CustomerExpand,
	type FullCustomer,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { redemptionRepo } from "@/internal/rewards/repos/index.js";

export const getCusReferredBy = async ({
	db,
	fullCus,
	expand,
}: {
	db: DrizzleCli;
	fullCus: FullCustomer;
	expand?: CustomerExpand[];
}) => {
	if (!expand?.includes(CustomerExpand.ReferredBy)) {
		return undefined;
	}

	const redemptions = await redemptionRepo.getByRedeemer({
		db,
		internalCustomerId: fullCus.internal_id,
		withRewardProgram: true,
		limit: 100,
	});

	return redemptions.map((r) =>
		ApiCusReferredBySchema.parse({
			program_id: r.reward_program?.id,
			referrer: {
				id: r.referrer.id,
				name: r.referrer.name,
				email: r.referrer.email,
			},
			reward_applied: r.redeemer_applied,
			created_at: r.created_at,
		}),
	);
};
