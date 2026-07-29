import {
	type ApiFeatureGrantV0,
	type ApiGrantV0,
	type Entitlement,
	type EntitlementDuration,
	type Feature,
	findFeatureByInternalId,
	getGlobalMaxRedemption,
	type Reward,
} from "@autumn/shared";

type RewardEntitlementRow = Entitlement & {
	expiry?: { duration: EntitlementDuration; length: number } | null;
};

/** Public expiry for an entitlement row — handles both column form and an `expiry` object. */
const getGrantExpiry = (
	entitlement: RewardEntitlementRow,
): ApiGrantV0["expiry"] => {
	const { expiry } = entitlement;
	if (expiry && expiry.length != null) {
		return { type: expiry.duration, length: expiry.length };
	}

	if (entitlement.expiry_duration && entitlement.expiry_length != null) {
		return {
			type: entitlement.expiry_duration,
			length: entitlement.expiry_length,
		};
	}

	return null;
};

/** Maps a feature_grant reward row to the V0 feature-grant shape (features supplied by caller). */
export const getApiFeatureGrant = ({
	reward,
	features,
}: {
	reward: Reward;
	features: Feature[];
}): ApiFeatureGrantV0 => {
	const entitlements = reward.entitlements ?? [];

	const grants: ApiGrantV0[] = entitlements.map(
		(entitlement: RewardEntitlementRow) => {
			const feature = findFeatureByInternalId({
				features,
				internalId: entitlement.internal_feature_id,
			});

			return {
				feature_id: feature?.id ?? entitlement.internal_feature_id,
				included: entitlement.allowance ?? null,
				expiry: getGrantExpiry(entitlement),
			};
		},
	);

	return {
		id: reward.id,
		name: reward.name,
		grants,
		promo_codes: reward.promo_codes.map((promoCode) => ({
			code: promoCode.code,
			max_uses: getGlobalMaxRedemption(promoCode) ?? null,
		})),
		created_at: reward.created_at,
	};
};
