import type { AppEnv } from "@autumn/shared";
import type { Redis } from "ioredis";
import {
	getConfiguredRegions,
	getRegionalRedis,
} from "@/external/redis/initRedis.js";
import { buildPathIndexKey } from "@/internal/customers/cache/pathIndex/pathIndexConfig.js";
import {
	buildFullCustomerCacheGuardKey,
	buildFullCustomerCacheKey,
	FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS,
} from "./fullCustomerCacheConfig.js";
import { buildTestFullCustomerCacheGuardKey } from "./testFullCustomerCacheGuard.js";

type CustomerToDelete = {
	orgId: string;
	env: AppEnv;
	customerId: string;
};

const isProductionNode = process.env.NODE_ENV === "production";

/**
 * Per org: all keys share `{orgId}` so Redis Cluster stays in one slot per pipeline.
 */
const deleteFullCustomerCacheRowsForOrg = async ({
	regionalRedis,
	orgCustomers,
	guardTimestamp,
}: {
	regionalRedis: Redis;
	orgCustomers: CustomerToDelete[];
	guardTimestamp: string;
}): Promise<{ deleted: number; skipped: number }> => {
	let skipped = 0;
	let customersToProcess = orgCustomers;

	if (!isProductionNode) {
		const existsPipeline = regionalRedis.pipeline();
		for (const customer of orgCustomers) {
			existsPipeline.exists(
				buildTestFullCustomerCacheGuardKey({
					orgId: customer.orgId,
					env: customer.env,
					customerId: customer.customerId,
				}),
			);
		}
		const existsResults = await existsPipeline.exec();
		if (!existsResults) return { deleted: 0, skipped: 0 };

		const allowed: CustomerToDelete[] = [];
		for (let index = 0; index < orgCustomers.length; index++) {
			const tuple = existsResults[index];
			if (!tuple)
				throw new Error(
					"batchDeleteCachedFullCustomers: missing EXISTS result",
				);
			const [error, existsCount] = tuple;
			if (error) throw error;
			if (existsCount === 1) {
				skipped += 1;
				continue;
			}
			allowed.push(orgCustomers[index]!);
		}
		customersToProcess = allowed;
	}

	if (customersToProcess.length === 0) return { deleted: 0, skipped };

	const pipeline = regionalRedis.pipeline();
	for (const customer of customersToProcess) {
		const { orgId, env, customerId } = customer;
		const guardKey = buildFullCustomerCacheGuardKey({ orgId, env, customerId });
		const cacheKey = buildFullCustomerCacheKey({ orgId, env, customerId });
		const pathIndexKey = buildPathIndexKey({ orgId, env, customerId });
		pipeline.set(
			guardKey,
			guardTimestamp,
			"EX",
			FULL_CUSTOMER_CACHE_GUARD_TTL_SECONDS,
		);
		pipeline.unlink(cacheKey);
		pipeline.unlink(pathIndexKey);
	}

	const deleteResults = await pipeline.exec();
	if (!deleteResults) return { deleted: 0, skipped };

	let deleted = 0;
	for (
		let customerIndex = 0;
		customerIndex < customersToProcess.length;
		customerIndex++
	) {
		const baseIndex = customerIndex * 3;
		for (let commandOffset = 0; commandOffset < 3; commandOffset++) {
			const tuple = deleteResults[baseIndex + commandOffset];
			if (!tuple)
				throw new Error(
					"batchDeleteCachedFullCustomers: missing pipeline result",
				);
			const [error] = tuple;
			if (error) throw error;
		}
		const unlinkCacheTuple = deleteResults[baseIndex + 1];
		const unlinkCount = unlinkCacheTuple![1] as number;
		if (unlinkCount > 0) deleted += 1;
	}

	return { deleted, skipped };
};

/**
 * Batch delete multiple FullCustomer caches across ALL regions.
 */
export const batchDeleteCachedFullCustomers = async ({
	customers,
}: {
	customers: CustomerToDelete[];
}): Promise<number> => {
	if (customers.length === 0) return 0;

	const customersByOrg = new Map<string, CustomerToDelete[]>();
	for (const customer of customers) {
		const existing = customersByOrg.get(customer.orgId) || [];
		existing.push(customer);
		customersByOrg.set(customer.orgId, existing);
	}

	const regions = getConfiguredRegions();
	const guardTimestamp = Date.now().toString();

	const regionPromises = regions.map(async (region) => {
		const regionalRedis = getRegionalRedis(region);

		if (regionalRedis.status !== "ready") {
			console.warn(`[batchDeleteCachedFullCustomers] ${region}: not_ready`);
			return 0;
		}

		let deleted = 0;
		let skipped = 0;
		for (const orgCustomers of customersByOrg.values()) {
			const orgResult = await deleteFullCustomerCacheRowsForOrg({
				regionalRedis,
				orgCustomers,
				guardTimestamp,
			});
			deleted += orgResult.deleted;
			skipped += orgResult.skipped;
		}

		const skipSuffix =
			!isProductionNode && skipped > 0 ? `, skipped_test_guard ${skipped}` : "";
		console.info(
			`[batchDeleteCachedFullCustomers] ${region}: unlinked ${deleted} cache keys, customers (${customers.length}), orgs (${customersByOrg.size})${skipSuffix}`,
		);
		return deleted;
	});

	const regionDeleted = await Promise.all(regionPromises);
	return regionDeleted.reduce((sum, count) => sum + count, 0);
};
