import {
	ApiCusReferralSchema,
	CustomerExpand,
	type FullCustomer,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { redemptionRepo } from "@/internal/rewards/repos/index.js";

export const getCusReferrals = async ({
	db,
	fullCus,
	expand,
}: {
	db: DrizzleCli;
	fullCus: FullCustomer;
	expand?: CustomerExpand[];
}) => {
	if (!expand?.includes(CustomerExpand.Referrals)) {
		return undefined;
	}

	const referred = await redemptionRepo.getByReferrer({
		db,
		internalCustomerId: fullCus.internal_id,
		withRewardProgram: true,
		limit: 100,
	});

	return referred.map((r) =>
		ApiCusReferralSchema.parse({
			program_id: r.reward_program?.id,
			customer: {
				id: r.customer.id,
				name: r.customer.name,
				email: r.customer.email,
			},
			reward_applied: r.applied,
			created_at: r.created_at,
		}),
	);
};
