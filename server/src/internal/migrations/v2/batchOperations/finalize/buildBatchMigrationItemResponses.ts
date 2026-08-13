import { type Feature, isOneOffProduct } from "@autumn/shared";
import {
	buildBalanceChanges,
	buildFlagChanges,
} from "@/internal/billing/v2/actions/buildBillingChanges";
import type { PreviewMigrateCustomer } from "@/internal/migrations/v2/preview/previewMigrateCustomer/types/index.js";
import type { BatchMigrationPageCustomer } from "../execute/types/batchMigrationExecutionTypes.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import type { ChangedItem } from "./buildBatchMigrationWebhookRecords/buildBatchMigrationWebhookRecords.js";
import { insertedItemsToPlanChange } from "./buildBatchMigrationWebhookRecords/insertedItemsToPlanChange.js";
import {
	buildEntitlementLookup,
	buildOneOffByPlanId,
	toCustomerItemChanges,
} from "./buildMigrationItemEvent/toCustomerItemChanges.js";

const groupByCustomer = ({
	changedItems,
}: {
	changedItems: ChangedItem[];
}): Map<string, ChangedItem[]> => {
	const grouped = new Map<string, ChangedItem[]>();
	for (const item of changedItems) {
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
	changedItems,
	features,
}: {
	plan: BatchMigrationExecutionPlan;
	customers: BatchMigrationPageCustomer[];
	changedItems: ChangedItem[];
	features: Feature[];
}): Map<string, PreviewMigrateCustomer> => {
	const entitlementLookup = buildEntitlementLookup({ plan });
	const itemsByCustomer = groupByCustomer({ changedItems });
	const oneOffByPlanId = buildOneOffByPlanId({ plan });

	return new Map(
		customers.map((customer) => {
			const customerItems = itemsByCustomer.get(customer.internalId) ?? [];
			const changes = toCustomerItemChanges({
				items: customerItems.filter((item) => item.action === "created"),
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
