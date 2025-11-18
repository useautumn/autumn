import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
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
	payload: SyncBatchPayload | any; // Allow any for backwards compatibility
}) => {
	// Backwards compatibility: handle both old (items array) and new (item object) formats
	let item = payload.item;

	// Old format: { items: [...] }
	if (!item && payload.items && Array.isArray(payload.items)) {
		item = payload.items[0];
		console.warn(
			"⚠️  Received old format sync message with items array, using first item",
		);
	}

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

	try {
		await syncItem({ item, ctx });
		logger.info(`✅ Successfully synced: ${itemDescription}`);
	} catch (error) {
		logger.error(`❌ Failed to sync: ${itemDescription}`, {
			error: error instanceof Error ? error : new Error(String(error)),
			item,
		});
		// Re-throw to trigger SQS retry
		throw error;
	}
};
