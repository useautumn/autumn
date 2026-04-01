import type { FullCustomer, FullSubject } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildPathIndex } from "@/internal/customers/cache/pathIndex/buildPathIndex.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import {
	buildFullSubjectCacheKey,
	FULL_SUBJECT_CACHE_TTL_SECONDS,
} from "./fullSubjectCacheConfig.js";

type SetCacheResult = "OK" | "STALE_WRITE" | "CACHE_EXISTS" | "FAILED";

/**
 * Set FullSubject in Redis cache.
 * Reuses the existing setFullCustomerCache Lua script — it's key-agnostic.
 */
export const setCachedFullSubject = async ({
	ctx,
	fullSubject,
	fetchTimeMs,
	source,
	overwrite = false,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	fetchTimeMs: number;
	source?: string;
	overwrite?: boolean;
}): Promise<SetCacheResult> => {
	const { org, env, logger } = ctx;

	const cacheKey = buildFullSubjectCacheKey({
		orgId: org.id,
		env,
		customerId: fullSubject.customerId,
		entityId: fullSubject.entityId,
	});

	const pathIndexEntries = buildPathIndex({
		fullCustomer: {
			customer_products: fullSubject.customer_products,
			extra_customer_entitlements: fullSubject.extra_customer_entitlements,
		} as Pick<
			FullCustomer,
			"customer_products" | "extra_customer_entitlements"
		> as FullCustomer,
	});
	const pathIndexJson = JSON.stringify(pathIndexEntries);

	const result = await tryRedisWrite(async () => {
		return await redis.setFullCustomerCache(
			cacheKey,
			org.id,
			env,
			fullSubject.customerId,
			String(fetchTimeMs),
			String(FULL_SUBJECT_CACHE_TTL_SECONDS),
			JSON.stringify(fullSubject),
			String(overwrite),
			pathIndexJson,
		);
	});

	if (result === null) {
		logger.warn(
			`[setCachedFullSubject] Redis write failed for ${fullSubject.customerId}${fullSubject.entityId ? `:${fullSubject.entityId}` : ""}`,
		);
		return "FAILED";
	}

	const subjectLabel = fullSubject.entityId
		? `${fullSubject.customerId}:${fullSubject.entityId}`
		: fullSubject.customerId;

	logger.info(
		`[setCachedFullSubject] ${subjectLabel}: ${result}, source: ${source}`,
	);
	addToExtraLogs({
		ctx,
		extras: {
			setCacheSubject: {
				result,
				subjectType: fullSubject.subjectType,
			},
		},
	});

	return result;
};
