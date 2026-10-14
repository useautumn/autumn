import type { Entitlement, Price } from "@autumn/shared";

export type RowBuckets<Row> = {
	new: Row[];
	updated: Row[];
	same: Row[];
	deleted: Row[];
	retired: Row[];
};

export type EntitlementPricesDiff = {
	prices: Omit<RowBuckets<Price>, "retired">;
	entitlements: Omit<RowBuckets<Entitlement>, "retired">;
};

export type EntitlementPricesPlan = {
	prices: RowBuckets<Price>;
	entitlements: RowBuckets<Entitlement>;
	projected: {
		prices: Price[];
		entitlements: Entitlement[];
	};
};

export const emptyEntitlementPricesPlan = (): EntitlementPricesPlan => ({
	prices: { new: [], updated: [], same: [], deleted: [], retired: [] },
	entitlements: { new: [], updated: [], same: [], deleted: [], retired: [] },
	projected: { prices: [], entitlements: [] },
});

export const entitlementPricesPlanHasWrites = ({
	plan,
}: {
	plan: EntitlementPricesPlan;
}): boolean =>
	plan.prices.new.length > 0 ||
	plan.prices.updated.length > 0 ||
	plan.prices.deleted.length > 0 ||
	plan.prices.retired.length > 0 ||
	plan.entitlements.new.length > 0 ||
	plan.entitlements.updated.length > 0 ||
	plan.entitlements.deleted.length > 0 ||
	plan.entitlements.retired.length > 0;
