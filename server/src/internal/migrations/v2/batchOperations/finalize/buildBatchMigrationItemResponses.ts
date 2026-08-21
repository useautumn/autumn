import type { CustomerPlanChange, Feature } from "@autumn/shared";
import {
	buildBalanceChanges,
	buildFlagChanges,
} from "@/internal/billing/v2/actions/buildBillingChanges";
import type { PreviewMigrateCustomer } from "@/internal/migrations/v2/preview/previewMigrateCustomer/types/index.js";
import type { BatchMigrationPageResult } from "../execute/types/batchMigrationExecutionTypes.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import {
	buildBatchMigrationPlanChanges,
	buildEntitlementLookup,
	type ChangedItem,
	toChangedItems,
} from "./planChanges/buildBatchMigrationPlanChanges.js";
import { toCustomerItemChanges } from "./toCustomerItemChanges.js";

const groupPlanChangesByCustomer = ({
	pageResult,
	plan,
	features,
}: {
	pageResult: BatchMigrationPageResult;
	plan: BatchMigrationExecutionPlan;
	features: Feature[];
}): Map<string, CustomerPlanChange[]> => {
	const grouped = new Map<string, CustomerPlanChange[]>();
	for (const entry of buildBatchMigrationPlanChanges({
		pageResult,
		plan,
		features,
	})) {
		const planChanges = grouped.get(entry.internalCustomerId) ?? [];
		planChanges.push(entry.planChange);
		grouped.set(entry.internalCustomerId, planChanges);
	}
	return grouped;
};

const groupChangedItemsByCustomer = ({
	items,
}: {
	items: ChangedItem[];
}): Map<string, ChangedItem[]> => {
	const grouped = new Map<string, ChangedItem[]>();
	for (const item of items) {
		const existing = grouped.get(item.internalCustomerId) ?? [];
		existing.push(item);
		grouped.set(item.internalCustomerId, existing);
	}
	return grouped;
};

/**
 * Per-customer migration response for a page, without loading any customer:
 * the changed rows ARE the diff — created rows carry the after-state, deleted
 * rows the before-state (a replace contributes one of each). Same shape the
 * per-customer lane emits.
 */
export const buildBatchMigrationItemResponses = ({
	plan,
	pageResult,
	features,
}: {
	plan: BatchMigrationExecutionPlan;
	pageResult: BatchMigrationPageResult;
	features: Feature[];
}): Map<string, PreviewMigrateCustomer> => {
	const entitlementLookup = buildEntitlementLookup({ plan });
	const itemsByCustomer = groupChangedItemsByCustomer({
		items: toChangedItems(pageResult),
	});
	const planChangesByCustomer = groupPlanChangesByCustomer({
		pageResult,
		plan,
		features,
	});

	return new Map(
		pageResult.succeeded.map((customer) => {
			const changes = toCustomerItemChanges({
				items: itemsByCustomer.get(customer.internalId) ?? [],
				entitlementLookup,
			});

			// Typed literal rather than a Zod parse: this object is built in-process
			// from already-typed inputs, so parsing 5000x per page re-derives nothing.
			const preview: PreviewMigrateCustomer = {
				object: "migration_customer_preview",
				customer_id: customer.id ?? customer.internalId,
				plan_changes: planChangesByCustomer.get(customer.internalId) ?? [],
				balance_changes: buildBalanceChanges({
					beforeBalances: changes.beforeBalances,
					afterBalances: changes.afterBalances,
				}),
				flag_changes: buildFlagChanges({
					beforeFlags: changes.beforeFlags,
					afterFlags: changes.afterFlags,
				}),
			};
			return [customer.internalId, preview];
		}),
	);
};
