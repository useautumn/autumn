import { type AppEnv, getRelevantFeatures } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { sql } from "drizzle-orm";
import type { Logger } from "pino";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { getCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/getCachedApiCustomer.js";
import { getApiCustomerBase } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createWorkerContext } from "@/queue/createWorkerContext.js";
import { runDeductionTx } from "../trackUtils/runDeductionTx.js";

interface SyncItem {
	customerId: string;
	featureId: string;
	orgId: string;
	env: string;
	entityId?: string;
}

interface SyncBatchPayload {
	items: SyncItem[];
}

/**
 * Handle syncing a single item from Redis to PostgreSQL
 */
const syncItem = async ({
	item,
	ctx,
}: {
	item: SyncItem;
	ctx: AutumnContext;
}) => {
	const { customerId, featureId, entityId } = item;
	const { db, org, env, logger } = ctx;

	// CRITICAL: Lock customer_entitlements rows to prevent concurrent syncs
	// This prevents race condition where two sync jobs read the same stale balance
	await db.execute(
		sql`SELECT id FROM customer_entitlements 
		    WHERE customer_id = (SELECT id FROM customers WHERE customer_id = ${customerId} AND org_id = ${org.id} AND env = ${env})
		    FOR UPDATE`,
	);

	// Get cached customer from Redis
	const { apiCustomer: redisCustomer } = await getCachedApiCustomer({
		ctx,
		customerId,
	});

	// Get fresh customer from DB (with locked rows)
	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
		inStatuses: RELEVANT_STATUSES,
		withEntities: false,
		withSubs: true,
		entityId,
	});

	const { apiCustomer: pgCustomer } = await getApiCustomerBase({
		ctx,
		fullCus,
		withAutumnId: false,
	});

	const relevantFeatures = getRelevantFeatures({
		features: ctx.features,
		featureId,
	});

	for (const relevantFeature of relevantFeatures) {
		// Fresh customer feature
		const pgCusFeature = pgCustomer.features[relevantFeature.id];
		const redisCusFeature = redisCustomer.features[relevantFeature.id];

		logger.info(
			`Syncing (${customerId}, ${featureId}) | Postgres: ${pgCusFeature?.balance} | Redis: ${redisCusFeature?.balance}`,
		);

		// TODO: Calculate balance difference and run deduction
		const deduction = new Decimal(pgCusFeature?.balance ?? 0)
			.minus(new Decimal(redisCusFeature?.balance ?? 0))
			.toNumber();

		if (deduction !== 0) {
			await runDeductionTx({
				ctx,
				customerId,
				entityId,
				deductions: [{ feature: relevantFeature, deduction }],
			});
		}
	}
};

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
		logger.info("No items to sync");
		return;
	}

	logger.info(`🔄 Processing sync batch with ${items.length} items`);

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

	logger.info(`Fetching orgs for ${uniqueOrgEnvPairs.size} environments`);

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
