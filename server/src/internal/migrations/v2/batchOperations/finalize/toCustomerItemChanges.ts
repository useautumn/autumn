import {
	type ApiBalanceV1,
	type ApiFlagV0,
	type EntitlementWithFeature,
	FeatureType,
} from "@autumn/shared";
import type { ChangedItem } from "./planChanges/buildBatchMigrationPlanChanges.js";

export type CustomerItemChanges = {
	beforeBalances: Record<string, ApiBalanceV1>;
	afterBalances: Record<string, ApiBalanceV1>;
	beforeFlags: Record<string, ApiFlagV0>;
	afterFlags: Record<string, ApiFlagV0>;
};

const toApiBalance = ({ item }: { item: ChangedItem }): ApiBalanceV1 => {
	const granted = item.granted ?? 0;
	const remaining = item.remaining ?? granted;
	return {
		object: "balance",
		feature_id: item.featureId,
		granted,
		remaining,
		usage: granted - remaining,
		unlimited: item.unlimited === true,
		overage_allowed: false,
		max_purchase: null,
		next_reset_at: item.nextResetAt ?? null,
	};
};

const toApiFlag = ({ item }: { item: ChangedItem }): ApiFlagV0 => ({
	object: "flag",
	id: item.featureId,
	feature_id: item.featureId,
	plan_id: item.planId,
	expires_at: null,
});

/** Deleted rows describe the pre-migration state, created rows the post
 * state — a replace contributes one of each, so the diff carries real usage. */
export const toCustomerItemChanges = ({
	items,
	entitlementLookup,
}: {
	items: ChangedItem[];
	entitlementLookup: Map<string, EntitlementWithFeature>;
}): CustomerItemChanges => {
	const changes: CustomerItemChanges = {
		beforeBalances: {},
		afterBalances: {},
		beforeFlags: {},
		afterFlags: {},
	};

	for (const item of items) {
		const entitlement =
			item.action === "deleted"
				? item.entitlement
				: entitlementLookup.get(`${item.planId}:${item.featureId}`);
		if (!entitlement) continue;

		const isBefore = item.action === "deleted";
		if (entitlement.feature.type === FeatureType.Boolean) {
			const flags = isBefore ? changes.beforeFlags : changes.afterFlags;
			flags[item.featureId] = toApiFlag({ item });
		} else {
			const balances = isBefore
				? changes.beforeBalances
				: changes.afterBalances;
			balances[item.featureId] = toApiBalance({ item });
		}
	}

	return changes;
};
