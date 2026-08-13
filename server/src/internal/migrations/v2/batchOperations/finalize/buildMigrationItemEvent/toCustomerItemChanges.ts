import {
	type ApiBalanceV1,
	type ApiFlagV0,
	type EntitlementWithFeature,
	FeatureType,
	isOneOffProduct,
} from "@autumn/shared";
import type { BatchMigrationExecutionPlan } from "../../types/index.js";
import type { ChangedItem } from "../buildBatchMigrationWebhookRecords/buildBatchMigrationWebhookRecords.js";

export type CustomerItemChanges = {
	beforeBalances: Record<string, ApiBalanceV1>;
	afterBalances: Record<string, ApiBalanceV1>;
	beforeFlags: Record<string, ApiFlagV0>;
	afterFlags: Record<string, ApiFlagV0>;
	addedEntitlementsByPlan: Map<string, EntitlementWithFeature[]>;
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

export const buildEntitlementLookup = ({
	plan,
}: {
	plan: BatchMigrationExecutionPlan;
}): Map<string, EntitlementWithFeature> =>
	new Map(
		plan.patches.flatMap((patch) => [
			...patch.addEntitlementOps.map(
				(add): [string, EntitlementWithFeature] => [
					`${patch.fromProduct.id}:${add.entitlement.feature.id}`,
					add.entitlement,
				],
			),
			// License rows key on their own plan, not the parent the patch filtered on.
			...patch.licenseEntitlementOps.flatMap(
				(operation): [string, EntitlementWithFeature][] =>
					operation.type === "remove_license_entitlement"
						? []
						: [
								[
									`${operation.licensePlanId}:${operation.entitlement.feature.id}`,
									operation.entitlement,
								],
							],
			),
		]),
	);

export const buildOneOffByPlanId = ({
	plan,
}: {
	plan: BatchMigrationExecutionPlan;
}): Map<string, boolean> =>
	new Map(
		plan.patches.flatMap((patch): [string, boolean][] => [
			[
				patch.fromProduct.id,
				isOneOffProduct({ prices: patch.fromProduct.prices }),
			],
			...patch.licenseEntitlementOps.map((operation): [string, boolean] => [
				operation.licensePlanId,
				operation.isOneOff,
			]),
		]),
	);

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
		addedEntitlementsByPlan: new Map(),
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

		if (item.action !== "created") continue;
		const added = changes.addedEntitlementsByPlan.get(item.planId) ?? [];
		if (!added.some((entry) => entry.feature.id === item.featureId)) {
			added.push(entitlement);
		}
		changes.addedEntitlementsByPlan.set(item.planId, added);
	}

	return changes;
};
