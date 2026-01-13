import type { AutumnContext } from "@server/honoUtils/HonoEnv.js";
import { type SyncItem, syncItem } from "./syncItem.js";

interface SyncBatchPayload {
	item: SyncItem;
}

/**
 * Worker that syncs a single Redis balance deduction back to PostgreSQL
 * Each SQS message contains one sync item (deduplicated by SQS)
 */
export const runSyncBalanceBatch = async ({
	ctx,
	payload,
}: {
	ctx?: AutumnContext;
	payload: SyncBatchPayload;
}) => {
	const item = payload.item;

	if (!item || !ctx) {
		console.warn("⚠️  No sync item provided");
		return;
	}

	const { logger } = ctx;

	// Log what we're syncing
	const itemDescription = item.entityId
		? `customer: ${item.customerId}, entity: ${item.entityId}, feature: ${item.featureId}`
		: `customer: ${item.customerId}, feature: ${item.featureId}`;

	logger.info(`🔄 Starting sync: ${itemDescription}`);

	await syncItem({ item, ctx });
	logger.info(`✅ Successfully synced: ${itemDescription}`);
	// try {

	// } catch (error) {
	// 	logger.error(`❌ Failed to sync: ${itemDescription}`, {
	// 		error: error instanceof Error ? error : new Error(String(error)),
	// 		item,
	// 	});
	// 	// Re-throw to trigger SQS retry
	// 	throw error;
	// }
};
