import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { type SyncItem, syncItem } from "./syncItem.js";

interface SyncBatchPayload {
	items: SyncItem[];
}

/**
 * Worker that syncs Redis balance deductions back to PostgreSQL
 * Groups items by org to minimize DB queries and optimize transactions
 */
export const runSyncBalanceBatch = async ({
	ctx,
	payload,
}: {
	ctx?: AutumnContext;
	payload: SyncBatchPayload;
}) => {
	const { items } = payload;

	if (!items || !ctx || items.length === 0) return;

	const { logger } = ctx;

	// All items belong to the same customer (grouped by messageGroupId in SQS)
	const firstItem = items[0];
	const { customerId } = firstItem;

	// Sort items by timestamp (oldest first) to maintain chronological order
	const sortedItems = items.sort((a, b) => a.timestamp - b.timestamp);

	// Process each item sequentially for this customer
	let successCount = 0;

	for (const item of sortedItems) {
		try {
			await syncItem({ item, ctx });
			successCount++;
		} catch (error) {
			logger.error(
				`❌ Failed to sync item ${item.customerId}:${item.featureId}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	logger.info(
		`Synced ${successCount}/${items.length} items for customer ${customerId}`,
	);
};
