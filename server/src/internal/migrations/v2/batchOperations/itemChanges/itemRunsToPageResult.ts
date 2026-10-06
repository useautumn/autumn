import { MigrationItemRunStatus } from "@autumn/shared";
import type { ItemRunToPublish } from "../execute/claim/listItemRunsToPublish.js";
import type { BatchMigrationPageResult } from "../execute/types/batchMigrationExecutionTypes.js";

export const itemRunsToPageResult = ({
	itemRuns,
}: {
	itemRuns: ItemRunToPublish[];
}): BatchMigrationPageResult => {
	const succeeded = itemRuns.filter(
		(itemRun) =>
			itemRun.status === MigrationItemRunStatus.Succeeded &&
			itemRun.changes !== null,
	);
	const skipped = itemRuns.filter(
		(itemRun) => itemRun.status === MigrationItemRunStatus.Skipped,
	);
	const result: BatchMigrationPageResult = {
		succeeded: succeeded.map((itemRun) => itemRun.customer),
		skipped: skipped.map((itemRun) => itemRun.customer),
		skipReasons: Object.fromEntries(
			skipped.flatMap((itemRun) =>
				itemRun.skipReason
					? [[itemRun.customer.internalId, itemRun.skipReason]]
					: [],
			),
		),
		insertedItems: [],
		removedItems: [],
		repointedProducts: [],
	};
	for (const itemRun of succeeded) {
		const internalCustomerId = itemRun.customer.internalId;
		for (const change of itemRun.changes ?? []) {
			switch (change.kind) {
				case "entitlement_created": {
					if (!change.entitlement || typeof change.isOneOff !== "boolean")
						throw new Error(
							"batch-migration: incomplete created item snapshot",
						);
					const { kind: _, ...item } = change;
					result.insertedItems.push({ internalCustomerId, ...item });
					break;
				}
				case "entitlement_deleted": {
					if (!change.entitlement || typeof change.isOneOff !== "boolean")
						throw new Error(
							"batch-migration: incomplete deleted item snapshot",
						);
					const { kind: _, ...item } = change;
					result.removedItems.push({ internalCustomerId, ...item });
					break;
				}
				case "customer_product_repointed": {
					if (!change.fromProduct || !change.toProduct)
						throw new Error(
							"batch-migration: incomplete product repoint snapshot",
						);
					const { kind: _, ...product } = change;
					result.repointedProducts?.push({ internalCustomerId, ...product });
					break;
				}
				case "license_pool_repointed":
					break;
			}
		}
	}
	return result;
};
