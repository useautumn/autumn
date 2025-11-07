import type { AppEnv } from "@autumn/shared";
import type { Logger } from "pino";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createWorkerContext } from "@/queue/createWorkerContext.js";
import { type SyncItem, syncItem } from "./syncItem.js";

interface SyncBatchPayload {
	items: SyncItem[];
}

/**
 * Worker that syncs Redis balance deductions back to PostgreSQL
 * Groups items by org to minimize DB queries and optimize transactions
 */
export const runSyncBalanceBatch = async ({
	db,
	payload,
	logger,
}: {
	db: DrizzleCli;
	payload: SyncBatchPayload;
	logger: Logger;
}) => {
	const { items } = payload;

	if (!items || items.length === 0) return;

	// All items belong to the same customer (grouped by messageGroupId in SQS)
	const firstItem = items[0];
	const { orgId, env, customerId } = firstItem;

	// Fetch org with features once for all items
	const orgData = await OrgService.getWithFeatures({
		db,
		orgId,
		env: env as AppEnv,
	});

	if (!orgData) {
		logger.error(`Organization not found: ${orgId}, env: ${env}`);
		return;
	}

	// Create worker context once
	const ctx = createWorkerContext({
		db,
		org: orgData.org,
		env: env as AppEnv,
		features: orgData.features,
		logger,
	});

	// Sort items by timestamp (oldest first) to maintain chronological order
	const sortedItems = items.sort((a, b) => a.timestamp - b.timestamp);

	// Process each item sequentially for this customer
	let successCount = 0;
	let errorCount = 0;

	for (const item of sortedItems) {
		try {
			await syncItem({ item, ctx });
			successCount++;
		} catch (error) {
			errorCount++;
			logger.error(
				`❌ Failed to sync item ${item.customerId}:${item.featureId}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	logger.info(
		`Synced ${successCount}/${items.length} items for customer ${customerId}`,
	);
};
