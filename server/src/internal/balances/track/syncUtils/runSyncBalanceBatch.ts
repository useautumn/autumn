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

	if (!items || items.length === 0) {
		return;
	}

	// Step 1: Gather unique (orgId, env) pairs and fetch orgs with features
	const uniqueOrgEnvPairs = new Map<
		string,
		{ orgIds: Set<string>; env: string }
	>();

	for (const item of items) {
		const envKey = item.env;
		if (!uniqueOrgEnvPairs.has(envKey)) {
			uniqueOrgEnvPairs.set(envKey, { orgIds: new Set(), env: envKey });
		}
		uniqueOrgEnvPairs.get(envKey)!.orgIds.add(item.orgId);
	}

	// Fetch orgs with features for each environment
	const orgMap = new Map<string, { org: any; features: any[] }>();

	for (const [, { orgIds, env }] of uniqueOrgEnvPairs.entries()) {
		const orgsWithFeatures = await OrgService.listWithFeatures({
			db,
			env: env as AppEnv,
			orgIds: Array.from(orgIds),
		});

		for (const orgData of orgsWithFeatures) {
			const key = `${orgData.org.id}:${env}`;
			orgMap.set(key, orgData);
		}
	}

	// Step 2: Process each sync item
	let successCount = 0;
	let errorCount = 0;

	for (const item of items) {
		try {
			const key = `${item.orgId}:${item.env}`;
			const orgData = orgMap.get(key);

			if (!orgData) {
				logger.warn(`Organization not found: ${key}`);
				errorCount++;
				continue;
			}

			// Create worker context
			const ctx = createWorkerContext({
				db,
				org: orgData.org,
				env: item.env as AppEnv,
				features: orgData.features,
				logger,
			});

			// Sync the item
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
		`Sync batch complete: ${successCount} succeeded, ${errorCount} failed`,
	);
};
