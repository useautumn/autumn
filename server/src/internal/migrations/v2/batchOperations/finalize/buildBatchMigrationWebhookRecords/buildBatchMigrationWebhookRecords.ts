import type { Feature } from "@autumn/shared";
import type { CustomerPlanChange } from "@autumn/shared/api/billing/common/customerPlanChange.js";
import type { MigrationWebhookRecord } from "@/internal/migrations/v2/webhookDelivery/types/migrationWebhookRecord.js";
import type {
	BatchMigrationInsertedItem,
	BatchMigrationPageCustomer,
	BatchMigrationPageResult,
	BatchMigrationRemovedItem,
} from "../../execute/types/batchMigrationExecutionTypes.js";
import type { BatchMigrationExecutionPlan } from "../../types/index.js";
import {
	buildEntitlementLookup,
	buildOneOffByPlanId,
} from "../buildMigrationItemEvent/toCustomerItemChanges.js";
import { insertedItemsToPlanChange } from "./insertedItemsToPlanChange.js";

export type ChangedItem = (
	| (BatchMigrationInsertedItem & { action: "created" })
	| (BatchMigrationRemovedItem & { action: "deleted" })
) & { entityId: string | null };

export const toChangedItems = ({
	insertedItems,
	removedItems,
}: Pick<
	BatchMigrationPageResult,
	"insertedItems" | "removedItems"
>): ChangedItem[] => [
	...insertedItems.map((item) => ({ ...item, action: "created" as const })),
	...removedItems.map((item) => ({ ...item, action: "deleted" as const })),
];

type ItemsByCustomerProduct = Map<string, ChangedItem[]>;

/** customer → entity (null = customer-level) → customer product → its rows.
 * Webhooks go out per (customer, entity): entity-level products notify the
 * entity, matching the per-customer lane's entity-targeted operations. */
const groupItemsByEntityAndProduct = ({
	changedItems,
}: {
	changedItems: ChangedItem[];
}): Map<string, Map<string | null, ItemsByCustomerProduct>> => {
	const byCustomer = new Map<
		string,
		Map<string | null, ItemsByCustomerProduct>
	>();
	for (const item of changedItems) {
		const byEntity =
			byCustomer.get(item.internalCustomerId) ??
			new Map<string | null, ItemsByCustomerProduct>();
		const byCustomerProduct =
			byEntity.get(item.entityId) ?? new Map<string, ChangedItem[]>();
		const items = byCustomerProduct.get(item.customerProductId) ?? [];
		items.push(item);
		byCustomerProduct.set(item.customerProductId, items);
		byEntity.set(item.entityId, byCustomerProduct);
		byCustomer.set(item.internalCustomerId, byEntity);
	}
	return byCustomer;
};

/**
 * Per-(customer, entity) delivery records: one `updated` plan change per
 * customer product that gained items, carrying the real subscription/purchase
 * snapshot (same shape the per-customer lane's `billing.updated` emits)
 * straight off the inserted rows — no re-read. Customers whose page was a
 * no-op carry no changes and are dropped rather than queued.
 */
export const buildBatchMigrationWebhookRecords = ({
	pageResult,
	plan,
	features,
}: {
	pageResult: BatchMigrationPageResult;
	plan: BatchMigrationExecutionPlan;
	features: Feature[];
}): MigrationWebhookRecord[] => {
	const entitlementLookup = buildEntitlementLookup({ plan });
	const oneOffByPlanId = buildOneOffByPlanId({ plan });
	const itemsByCustomer = groupItemsByEntityAndProduct({
		changedItems: toChangedItems(pageResult),
	});

	const toEntityRecord = ({
		customer,
		entityId,
		byCustomerProduct,
	}: {
		customer: BatchMigrationPageCustomer;
		entityId: string | null;
		byCustomerProduct: ItemsByCustomerProduct;
	}): MigrationWebhookRecord[] => {
		const planChanges: CustomerPlanChange[] = [];
		for (const items of byCustomerProduct.values()) {
			const planChange = insertedItemsToPlanChange({
				items,
				isOneOff: oneOffByPlanId.get(items[0].planId) ?? false,
				entitlementLookup,
				features,
			});
			if (planChange) planChanges.push(planChange);
		}
		if (planChanges.length === 0) return [];

		return [
			{
				customerId: customer.id ?? customer.internalId,
				internalCustomerId: customer.internalId,
				entityId,
				customerProductIds: [...byCustomerProduct.keys()],
				planChanges,
			},
		];
	};

	return pageResult.succeeded.flatMap((customer) => {
		const byEntity = itemsByCustomer.get(customer.internalId);
		if (!byEntity) return [];

		return [...byEntity.entries()].flatMap(([entityId, byCustomerProduct]) =>
			toEntityRecord({ customer, entityId, byCustomerProduct }),
		);
	});
};
