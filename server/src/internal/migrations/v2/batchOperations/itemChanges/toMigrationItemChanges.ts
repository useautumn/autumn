import type { MigrationItemChange } from "@autumn/shared";
import type { BatchMigrationChanges } from "../execute/types/batchMigrationChanges.js";
import {
	buildEntitlementLookup,
	buildOneOffByPlanId,
} from "../finalize/planChanges/buildBatchMigrationPlanChanges.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";

export const toMigrationItemChanges = ({
	insertedItems = [],
	removedItems = [],
	repointedProducts = [],
	repointedPoolCustomerIds = [],
	plan = { patches: [] },
}: BatchMigrationChanges & {
	plan?: BatchMigrationExecutionPlan;
}): Map<string, MigrationItemChange[]> => {
	const entitlementLookup = buildEntitlementLookup({ plan });
	const oneOffByPlanId = buildOneOffByPlanId({ plan });
	const isOneOffForItem = (item: { planId: string; isOneOff?: boolean }) => {
		const isOneOff = item.isOneOff ?? oneOffByPlanId.get(item.planId);
		if (isOneOff === undefined)
			throw new Error(
				`batch-migration: missing plan snapshot for ${item.planId}`,
			);
		return isOneOff;
	};
	const changesByCustomer = new Map<string, MigrationItemChange[]>();
	const add = (internalCustomerId: string, change: MigrationItemChange) => {
		const changes = changesByCustomer.get(internalCustomerId) ?? [];
		changes.push(change);
		changesByCustomer.set(internalCustomerId, changes);
	};

	for (const { internalCustomerId, ...item } of insertedItems) {
		const entitlement =
			item.entitlement ??
			entitlementLookup.get(`${item.planId}:${item.featureId}`);
		if (!entitlement)
			throw new Error(
				`batch-migration: missing entitlement snapshot for ${item.planId}:${item.featureId}`,
			);
		add(internalCustomerId, {
			kind: "entitlement_created",
			...item,
			entitlement,
			isOneOff: isOneOffForItem(item),
		});
	}
	for (const { internalCustomerId, ...item } of removedItems)
		add(internalCustomerId, {
			kind: "entitlement_deleted",
			...item,
			isOneOff: isOneOffForItem(item),
		});
	for (const { internalCustomerId, ...product } of repointedProducts)
		add(internalCustomerId, {
			kind: "customer_product_repointed",
			...product,
		});
	for (const internalCustomerId of repointedPoolCustomerIds)
		add(internalCustomerId, { kind: "license_pool_repointed" });

	return changesByCustomer;
};
