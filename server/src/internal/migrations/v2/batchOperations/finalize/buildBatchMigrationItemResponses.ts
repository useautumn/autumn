import { type Feature, isOneOffProduct } from "@autumn/shared";
import { buildBalanceChanges } from "@/internal/migrations/v2/preview/previewMigrateCustomer/buildBalanceChanges.js";
import { buildFlagChanges } from "@/internal/migrations/v2/preview/previewMigrateCustomer/buildFlagChanges.js";
import type { PreviewMigrateCustomer } from "@/internal/migrations/v2/preview/previewMigrateCustomer/types/index.js";
import type {
	BatchMigrationInsertedItem,
	BatchMigrationPageCustomer,
} from "../execute/types/batchMigrationExecutionTypes.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import { insertedItemsToPlanChange } from "./buildBatchMigrationWebhookRecords/insertedItemsToPlanChange.js";
import {
	buildEntitlementLookup,
	toCustomerItemChanges,
} from "./buildMigrationItemEvent/toCustomerItemChanges.js";

const groupByCustomer = ({
	insertedItems,
}: {
	insertedItems: BatchMigrationInsertedItem[];
}): Map<string, BatchMigrationInsertedItem[]> => {
	const grouped = new Map<string, BatchMigrationInsertedItem[]>();
	for (const item of insertedItems) {
		const existing = grouped.get(item.internalCustomerId) ?? [];
		existing.push(item);
		grouped.set(item.internalCustomerId, existing);
	}
	return grouped;
};

/**
 * Per-customer migration response for a page, without loading any customer:
 * the candidate dedup guarantees an inserted feature was ABSENT beforehand,
 * so the pre-migration state is empty by construction and the inserted rows
 * are exactly the diff. Same shape the per-customer lane emits.
 */
export const buildBatchMigrationItemResponses = ({
	plan,
	customers,
	insertedItems,
	features,
}: {
	plan: BatchMigrationExecutionPlan;
	customers: BatchMigrationPageCustomer[];
	insertedItems: BatchMigrationInsertedItem[];
	features: Feature[];
}): Map<string, PreviewMigrateCustomer> => {
	const entitlementLookup = buildEntitlementLookup({ plan });
	const itemsByCustomer = groupByCustomer({ insertedItems });
	const oneOffByPlanId = new Map(
		plan.patches.map((patch) => [
			patch.fromProduct.id,
			isOneOffProduct({ prices: patch.fromProduct.prices }),
		]),
	);

	return new Map(
		customers.map((customer) => {
			const customerItems = itemsByCustomer.get(customer.internalId) ?? [];
			const changes = toCustomerItemChanges({
				items: customerItems,
				entitlementLookup,
			});

			// One snapshot-bearing change per customer product — plan_id lives
			// in the snapshot, which the dashboard needs to name the plan.
			const itemsByCustomerProduct = new Map<string, typeof customerItems>();
			for (const item of customerItems) {
				const grouped =
					itemsByCustomerProduct.get(item.customerProductId) ?? [];
				grouped.push(item);
				itemsByCustomerProduct.set(item.customerProductId, grouped);
			}
			const planChanges = [...itemsByCustomerProduct.values()].flatMap(
				(items) => {
					const planChange = insertedItemsToPlanChange({
						items,
						isOneOff: oneOffByPlanId.get(items[0].planId) ?? false,
						entitlementLookup,
						features,
					});
					return planChange ? [planChange] : [];
				},
			);

			// Typed literal rather than a Zod parse: this object is built in-process
			// from already-typed inputs, so parsing 5000x per page re-derives nothing.
			const preview: PreviewMigrateCustomer = {
				object: "migration_customer_preview",
				customer_id: customer.id ?? customer.internalId,
				plan_changes: planChanges,
				balance_changes: buildBalanceChanges({
					beforeBalances: {},
					afterBalances: changes.balances,
				}),
				flag_changes: buildFlagChanges({
					beforeFlags: {},
					afterFlags: changes.flags,
				}),
			};
			return [customer.internalId, preview];
		}),
	);
};
