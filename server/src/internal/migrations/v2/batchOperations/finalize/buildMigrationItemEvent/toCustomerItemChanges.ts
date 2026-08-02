import {
	type ApiBalanceV1,
	type ApiFlagV0,
	type EntitlementWithFeature,
	FeatureType,
} from "@autumn/shared";
import type { BatchMigrationInsertedItem } from "../../execute/types/batchMigrationExecutionTypes.js";
import type { BatchMigrationExecutionPlan } from "../../types/index.js";

/** One customer's inserted rows, split by how the response renders them. */
export type CustomerItemChanges = {
	balances: Record<string, ApiBalanceV1>;
	flags: Record<string, ApiFlagV0>;
	/** Feature added per plan, deduped — a customer may hold several products
	 * on the same plan, but the plan gained the item once. */
	addedEntitlementsByPlan: Map<string, EntitlementWithFeature[]>;
};

const toApiBalance = ({
	item,
}: {
	item: BatchMigrationInsertedItem;
}): ApiBalanceV1 => ({
	object: "balance",
	feature_id: item.featureId,
	granted: item.granted ?? 0,
	remaining: item.granted ?? 0,
	usage: 0,
	unlimited: item.unlimited,
	overage_allowed: false,
	max_purchase: null,
	next_reset_at: item.nextResetAt,
});

const toApiFlag = ({
	item,
}: {
	item: BatchMigrationInsertedItem;
}): ApiFlagV0 => ({
	object: "flag",
	id: item.featureId,
	feature_id: item.featureId,
	plan_id: item.planId,
	expires_at: null,
});

/** Catalog entitlement per (plan, feature) — the item snapshot source. */
export const buildEntitlementLookup = ({
	plan,
}: {
	plan: BatchMigrationExecutionPlan;
}): Map<string, EntitlementWithFeature> =>
	new Map(
		plan.patches.flatMap((patch) =>
			patch.addEntitlementOps.map((add) => [
				`${patch.fromProduct.id}:${add.entitlement.feature.id}`,
				add.entitlement,
			]),
		),
	);

export const toCustomerItemChanges = ({
	items,
	entitlementLookup,
}: {
	items: BatchMigrationInsertedItem[];
	entitlementLookup: Map<string, EntitlementWithFeature>;
}): CustomerItemChanges => {
	const changes: CustomerItemChanges = {
		balances: {},
		flags: {},
		addedEntitlementsByPlan: new Map(),
	};

	for (const item of items) {
		const entitlement = entitlementLookup.get(
			`${item.planId}:${item.featureId}`,
		);
		if (!entitlement) continue;

		if (entitlement.feature.type === FeatureType.Boolean) {
			changes.flags[item.featureId] = toApiFlag({ item });
		} else {
			changes.balances[item.featureId] = toApiBalance({ item });
		}

		const added = changes.addedEntitlementsByPlan.get(item.planId) ?? [];
		if (!added.some((entry) => entry.feature.id === item.featureId)) {
			added.push(entitlement);
		}
		changes.addedEntitlementsByPlan.set(item.planId, added);
	}

	return changes;
};
