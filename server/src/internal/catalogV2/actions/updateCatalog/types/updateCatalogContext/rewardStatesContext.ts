import type {
	ApiCouponV0,
	ApiFeatureGrantV0,
	ApiReferralProgramV0,
} from "@autumn/shared";

/** One reward the org holds, in the branch shape the config states. */
export type RewardState = {
	internalId: string;
	id: string;
	kind: "coupon";
	coupon: ApiCouponV0;
};

export type FeatureGrantState = {
	internalId: string;
	id: string;
	kind: "feature_grant";
	featureGrant: ApiFeatureGrantV0;
};

export type CatalogRewardState = RewardState | FeatureGrantState;

export type ReferralProgramState = {
	internalId: string;
	program: ApiReferralProgramV0;
};

/**
 * Rewards the catalog can speak for. Free-product rewards are dropped at load,
 * so nothing downstream can propose touching one; `unstatableIds` keeps their
 * ids so a config claiming one is refused rather than silently overwriting.
 */
export type RewardStatesContext = {
	/** Empty when the payload never stated rewards — absent means "not mine". */
	rewards: CatalogRewardState[];
	/** Ids held by rewards the config cannot express (free product, invoice credits). */
	unstatableIds: Set<string>;
	/** Empty when the payload never stated referral programs. */
	programs: ReferralProgramState[];
};

export const emptyRewardStatesContext = (): RewardStatesContext => ({
	rewards: [],
	unstatableIds: new Set(),
	programs: [],
});
