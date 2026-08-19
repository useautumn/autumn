import type { Feature } from "@autumn/shared";
import type { MigrationWebhookRecord } from "@/internal/migrations/v2/webhookDelivery/types/migrationWebhookRecord.js";
import type { BatchMigrationPageResult } from "../execute/types/batchMigrationExecutionTypes.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import {
	type BatchMigrationPlanChangeEntry,
	buildBatchMigrationPlanChanges,
} from "./planChanges/buildBatchMigrationPlanChanges.js";

const groupEntriesByCustomerEntity = ({
	entries,
}: {
	entries: BatchMigrationPlanChangeEntry[];
}): Map<string, Map<string | null, BatchMigrationPlanChangeEntry[]>> => {
	const byCustomer = new Map<
		string,
		Map<string | null, BatchMigrationPlanChangeEntry[]>
	>();
	for (const entry of entries) {
		const byEntity =
			byCustomer.get(entry.internalCustomerId) ??
			new Map<string | null, BatchMigrationPlanChangeEntry[]>();
		const group = byEntity.get(entry.entityId) ?? [];
		group.push(entry);
		byEntity.set(entry.entityId, group);
		byCustomer.set(entry.internalCustomerId, byEntity);
	}
	return byCustomer;
};

/** Per-(customer, entity) delivery records. Entity-level products notify the
 * entity, matching the per-customer lane. Groups with no plan changes are dropped. */
export const buildBatchMigrationWebhookRecords = ({
	pageResult,
	plan,
	features,
}: {
	pageResult: BatchMigrationPageResult;
	plan: BatchMigrationExecutionPlan;
	features: Feature[];
}): MigrationWebhookRecord[] => {
	const entriesByCustomer = groupEntriesByCustomerEntity({
		entries: buildBatchMigrationPlanChanges({ pageResult, plan, features }),
	});

	const records: MigrationWebhookRecord[] = [];
	for (const customer of pageResult.succeeded) {
		const byEntity = entriesByCustomer.get(customer.internalId);
		if (!byEntity) continue;

		for (const [entityId, group] of byEntity) {
			if (group.length === 0) continue;

			records.push({
				customerId: customer.id ?? customer.internalId,
				internalCustomerId: customer.internalId,
				entityId,
				customerProductIds: [
					...new Set(group.map((entry) => entry.customerProductId)),
				],
				planChanges: group.map((entry) => entry.planChange),
			});
		}
	}

	return records;
};
