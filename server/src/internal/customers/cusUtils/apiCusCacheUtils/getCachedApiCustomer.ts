import {
	ApiBaseEntitySchema,
	type ApiCustomer,
	ApiCustomerV4Schema,
	type AppEnv,
	addToExpand,
	CusExpand,
	type CustomerLegacyData,
	CustomerLegacyDataSchema,
	filterOutEntitiesFromFullCustomer,
	filterPlanAndFeatureExpand,
} from "@autumn/shared";
import { CACHE_CUSTOMER_VERSION } from "@lua/cacheConfig.js";
import type { Redis } from "ioredis";
import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { tryRedisRead } from "../../../../utils/cacheUtils/cacheUtils.js";
import { normalizeFromSchema } from "../../../../utils/cacheUtils/normalizeFromSchema.js";
import { CusService } from "../../CusService.js";
import { getApiCustomerBase } from "../apiCusUtils/getApiCustomerBase.js";
import { setCachedApiCustomer } from "./setCachedApiCustomer.js";

export const buildCachedApiCustomerKey = ({
	customerId,
	orgId,
	env,
}: {
	customerId: string;
	orgId: string;
	env: string;
}) => {
	return `{${orgId}}:${env}:customer:${CACHE_CUSTOMER_VERSION}:${customerId}`;
};

/**
 * Get ApiCustomer from Redis cache
 * If not found, fetch from DB, cache it, and return
 * If skipCache is true, always fetch from DB
 */
export const getCachedApiCustomer = async ({
	ctx,
	customerId,
	skipEntityMerge = false,
	source,
	redisInstance,
	cacheVersion,
}: {
	ctx: AutumnContext;
	customerId: string;
	skipEntityMerge?: boolean; // If true, returns only customer's own features (no entity merging)
	source?: string;
	redisInstance?: Redis; // Optional redis instance for cross-region sync
	cacheVersion?: string; // Optional cache version override (for sync)
}): Promise<{ apiCustomer: ApiCustomer; legacyData: CustomerLegacyData }> => {
	const { org, env, db, skipCache } = ctx;
	const redisClient = redisInstance || redis;

	const getExpandedApiCustomer = async () => {
		// await redis.del(
		// 	buildCachedApiCustomerKey({ customerId, orgId: org.id, env }),
		// );
		// Try to get from cache using Lua script (unless skipCache is true)
		if (!skipCache) {
			const cachedResult = await tryRedisRead(() =>
				(redisClient as typeof redis).getCustomer(
					cacheVersion || "",
					org.id,
					env,
					customerId,
					skipEntityMerge ? "true" : "false",
				),
			);

			if (cachedResult) {
				const parsed = JSON.parse(cachedResult as string) as ApiCustomer & {
					legacyData: CustomerLegacyData;
				};

				// Extract legacyData before normalization (not in schema)
				const { legacyData, ...rest } = parsed;

				// Normalize the data based on schema
				const normalized = normalizeFromSchema<ApiCustomer>({
					schema: ApiCustomerV4Schema,
					data: rest,
				});

				const normalizedLegacyData = normalizeFromSchema<CustomerLegacyData>({
					schema: CustomerLegacyDataSchema,
					data: legacyData,
				});

				return {
					// ← This returns from getCachedApiCustomer!
					apiCustomer: ApiCustomerV4Schema.parse(normalized),
					legacyData: normalizedLegacyData,
				};
			}
		}

		// Cache miss or skipCache - fetch from DB
		// Record timestamp before Postgres fetch for stale write prevention

		const fetchTimeMs = Date.now();

		// Include invoices:
		const fullCus = await CusService.getFull({
			db,
			idOrInternalId: customerId,
			orgId: org.id,
			env: env as AppEnv,
			withEntities: true,
			withSubs: true,
			expand: [CusExpand.Invoices],
		});

		// Build ApiCustomer (base only, no expand) to return
		const ctxWithExpand = addToExpand({
			ctx,
			add: [CusExpand.Invoices, CusExpand.Entities],
		});
		const { apiCustomer, legacyData } = await getApiCustomerBase({
			ctx: ctxWithExpand,
			fullCus,
			withAutumnId: true,
		});

		try {
			apiCustomer.entities = fullCus.entities.map((e) =>
				ApiBaseEntitySchema.parse(e),
			);
		} catch (error) {
			ctx.logger.error(
				`[getCachedApiCustomer] Error parsing entities: ${error}`,
			);
		}

		const { apiCustomer: masterApiCustomer } = await getApiCustomerBase({
			ctx,
			fullCus: filterOutEntitiesFromFullCustomer({ fullCus }),
			withAutumnId: true,
		});

		// Store customer and entity caches (only if not skipping cache)
		if (!skipCache) {
			await setCachedApiCustomer({
				ctx,
				fullCus,
				customerId,
				source,
				fetchTimeMs,
			});
		}

		return {
			apiCustomer: ApiCustomerV4Schema.parse(
				skipEntityMerge ? masterApiCustomer : apiCustomer,
			),
			legacyData,
		};
	};

	const { apiCustomer, legacyData } = await getExpandedApiCustomer();

	const filteredApiCustomer = filterPlanAndFeatureExpand<ApiCustomer>({
		expand: ctx.expand,
		target: apiCustomer,
	});

	return {
		apiCustomer: {
			...filteredApiCustomer,
			rewards: filteredApiCustomer.rewards ?? undefined,
			referrals: filteredApiCustomer.referrals ?? undefined,
			payment_method: filteredApiCustomer.payment_method ?? undefined,
		},
		legacyData,
	};
};
