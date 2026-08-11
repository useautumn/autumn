import type { Entitlement, Feature, Price } from "@autumn/shared";

export type RowBuckets<Row> = {
	/** Insert — fresh catalog (or is_custom) rows. */
	new: Row[];
	/** Mutate existing row in place — only when not protecting referenced rows. */
	updated: Row[];
	/** Untouched — id carried forward. */
	same: Row[];
	/** Hard-delete candidates — only when not protecting referenced rows. */
	deleted: Row[];
	/** Leave catalog; execute may is_custom or hard-delete by refs. */
	retired: Row[];
};

/** Diff outcome before protect / stripe-carry attach retired. */
export type EntitlementPricesDiff = {
	prices: Omit<RowBuckets<Price>, "retired">;
	entitlements: Omit<RowBuckets<Entitlement>, "retired">;
};

/** Planned price/entitlement writes for one product content holder. */
export type EntitlementPricesPlan = {
	prices: RowBuckets<Price>;
	entitlements: RowBuckets<Entitlement>;
	newFeatures: Feature[];
	/** Product content after this plan: new + updated + same (not deleted/retired). */
	projected: {
		prices: Price[];
		entitlements: Entitlement[];
	};
};

export const emptyEntitlementPricesPlan = (): EntitlementPricesPlan => ({
	prices: { new: [], updated: [], same: [], deleted: [], retired: [] },
	entitlements: { new: [], updated: [], same: [], deleted: [], retired: [] },
	newFeatures: [],
	projected: { prices: [], entitlements: [] },
});

export const entitlementPricesPlanHasWrites = ({
	plan,
}: {
	plan: EntitlementPricesPlan;
}): boolean =>
	plan.newFeatures.length > 0 ||
	plan.prices.new.length > 0 ||
	plan.prices.updated.length > 0 ||
	plan.prices.deleted.length > 0 ||
	plan.prices.retired.length > 0 ||
	plan.entitlements.new.length > 0 ||
	plan.entitlements.updated.length > 0 ||
	plan.entitlements.deleted.length > 0 ||
	plan.entitlements.retired.length > 0;
