import type {
	ApiCouponV0,
	ApiFeatureGrantV0,
	ApiReferralProgramV0,
	RewardType,
} from "@autumn/shared";

export type CatalogCoupon = Omit<ApiCouponV0, "type"> & {
	type: RewardType.PercentageDiscount | RewardType.FixedDiscount;
};

export type RewardState = {
	internalId: string;
	id: string;
	kind: "coupon";
	coupon: CatalogCoupon;
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
	internalRewardId: string;
	program: ApiReferralProgramV0;
};

export type RewardStatesContext = {
	rewards: CatalogRewardState[];
	unstatableIds: Set<string>;
	unstatableInternalIds: Set<string>;
	programs: ReferralProgramState[];
	hiddenProgramIds: Set<string>;
	hiddenProgramInternalIds: Set<string>;
};

export const emptyRewardStatesContext = (): RewardStatesContext => ({
	rewards: [],
	unstatableIds: new Set(),
	unstatableInternalIds: new Set(),
	programs: [],
	hiddenProgramIds: new Set(),
	hiddenProgramInternalIds: new Set(),
});
