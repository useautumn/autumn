import {
	AllowanceType,
	type Entitlement,
	type Reward,
	type RewardEntitlement,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";

export type RewardWithEntitlementInputs = Partial<
	Omit<Reward, "entitlements">
> & {
	internal_id: string;
	org_id: string;
	entitlements?: (RewardEntitlement | Entitlement)[] | null;
};

export const rewardToEntitlementRows = ({
	reward,
}: {
	reward: RewardWithEntitlementInputs;
}): Entitlement[] => {
	const entitlements = reward.entitlements ?? [];

	return entitlements.map((entitlement) => {
		const expiry = "expiry" in entitlement ? entitlement.expiry : undefined;
		// Boolean grants carry no allowance
		const hasAllowance =
			entitlement.allowance != null && entitlement.allowance > 0;

		return {
			id:
				"id" in entitlement && entitlement.id
					? entitlement.id
					: generateId("ent"),
			created_at:
				"created_at" in entitlement && entitlement.created_at
					? entitlement.created_at
					: Date.now(),
			internal_feature_id: entitlement.internal_feature_id,
			internal_product_id: null,
			internal_reward_id: reward.internal_id,
			is_custom: false,
			allowance_type: hasAllowance ? AllowanceType.Fixed : AllowanceType.None,
			allowance: hasAllowance ? entitlement.allowance : null,
			interval: null,
			interval_count: 1,
			carry_from_previous: false,
			entity_feature_id: null,
			org_id: reward.org_id,
			feature_id:
				"feature_id" in entitlement ? entitlement.feature_id : undefined,
			usage_limit: null,
			expiry_duration:
				expiry?.duration ??
				("expiry_duration" in entitlement ? entitlement.expiry_duration : null),
			expiry_length:
				expiry?.length ??
				("expiry_length" in entitlement ? entitlement.expiry_length : null),
			rollover: null,
		};
	});
};
