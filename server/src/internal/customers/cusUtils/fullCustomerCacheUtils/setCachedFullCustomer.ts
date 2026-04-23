import { type FullCustomer, isBooleanCusEnt } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildPathIndex } from "@/internal/customers/cache/pathIndex/buildPathIndex.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import {
	buildFullCustomerCacheKey,
	FULL_CUSTOMER_CACHE_TTL_SECONDS,
} from "./fullCustomerCacheConfig.js";

type SetCacheResult = "OK" | "STALE_WRITE" | "CACHE_EXISTS" | "FAILED";

const BOOLEAN_ENTITLEMENT_LIMIT_ORG_ID = "GG6tnmO7cHb40PNhwYBTZtxQdeL74NHF";
const MAX_BOOLEAN_CUSTOMER_ENTITLEMENTS_PER_PRODUCT = 3;

const limitBooleanCustomerEntitlementsPerCustomerProduct = ({
	fullCustomer,
	orgId,
}: {
	fullCustomer: FullCustomer;
	orgId: string;
}): FullCustomer => {
	if (orgId !== BOOLEAN_ENTITLEMENT_LIMIT_ORG_ID) return fullCustomer;

	let hasChanges = false;
	const customerProducts = fullCustomer.customer_products.map(
		(customerProduct) => {
			let booleanCustomerEntitlementCount = 0;
			let customerProductHasChanges = false;

			const customerEntitlements = customerProduct.customer_entitlements.filter(
				(customerEntitlement) => {
					const isBooleanCustomerEntitlement = isBooleanCusEnt({
						cusEnt: customerEntitlement,
					});

					if (!isBooleanCustomerEntitlement) return true;

					if (
						booleanCustomerEntitlementCount >=
						MAX_BOOLEAN_CUSTOMER_ENTITLEMENTS_PER_PRODUCT
					) {
						hasChanges = true;
						customerProductHasChanges = true;
						return false;
					}

					booleanCustomerEntitlementCount += 1;
					return true;
				},
			);

			if (!customerProductHasChanges) return customerProduct;
			return {
				...customerProduct,
				customer_entitlements: customerEntitlements,
			};
		},
	);

	if (!hasChanges) return fullCustomer;
	return {
		...fullCustomer,
		customer_products: customerProducts,
	};
};

/**
 * Set FullCustomer in Redis cache
 * Includes stale write prevention using a guard key
 */
export const setCachedFullCustomer = async ({
	ctx,
	fullCustomer,
	customerId,
	fetchTimeMs,
	source,
	overwrite = false,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerId: string;
	fetchTimeMs: number;
	source?: string;
	overwrite?: boolean;
}): Promise<SetCacheResult> => {
	const { org, env, logger } = ctx;
	const fullCustomerForCache =
		limitBooleanCustomerEntitlementsPerCustomerProduct({
			fullCustomer,
			orgId: org.id,
		});

	const cacheKey = buildFullCustomerCacheKey({
		orgId: org.id,
		env,
		customerId,
	});
	const pathIndexEntries = buildPathIndex({
		fullCustomer: fullCustomerForCache,
	});
	const pathIndexJson = JSON.stringify(pathIndexEntries);

	const payload = { ...fullCustomer, _cachedAt: Date.now() };

	const result = await tryRedisWrite(async () => {
		return await redis.setFullCustomerCache(
			cacheKey,
			org.id,
			env,
			customerId,
			String(fetchTimeMs),
			String(FULL_CUSTOMER_CACHE_TTL_SECONDS),
			JSON.stringify(fullCustomerForCache),
			String(overwrite),
			pathIndexJson,
		);
	});

	if (result === null) {
		logger.warn(`[setCachedFullCustomer] Redis write failed for ${customerId}`);
		return "FAILED";
	}

	logger.info(
		`[setCachedFullCustomer] ${customerId}: ${result}, source: ${source}`,
	);
	addToExtraLogs({
		ctx,
		extras: {
			setCache: {
				result,
				fullCustomer: fullCustomerForCache,
			},
		},
	});

	return result;
};
