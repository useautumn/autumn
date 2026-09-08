import type {
	CatalogCouponParams,
	CatalogFeatureGrantParams,
	CatalogRewardKind,
	UpdateCatalogRewardParams,
} from "@autumn/shared";

export type RewardBranch =
	| { kind: "coupon"; body: CatalogCouponParams }
	| { kind: "feature_grant"; body: CatalogFeatureGrantParams };

/** Which branch of the union an entry states, with its body. */
export const rewardBranchOf = (
	entry: UpdateCatalogRewardParams,
): RewardBranch =>
	"coupon" in entry
		? { kind: "coupon", body: entry.coupon }
		: { kind: "feature_grant", body: entry.feature_grant };

export const rewardIdOf = (entry: UpdateCatalogRewardParams): string =>
	rewardBranchOf(entry).body.id;

export const rewardKindOf = (
	entry: UpdateCatalogRewardParams,
): CatalogRewardKind => rewardBranchOf(entry).kind;

export const rewardInternalIdOf = (
	entry: UpdateCatalogRewardParams,
): string | undefined => rewardBranchOf(entry).body.internal_id;
