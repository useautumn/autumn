import {
	type FullSubject,
	normalizedToFullSubject,
	type SubjectBalance,
} from "@autumn/shared";
import { isRedisMigrationCacheStale } from "@/external/redis/customerRedisRoutingInfo.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCachedFeatureBalance } from "@/internal/customers/cache/fullSubject/balances/getCachedFeatureBalances.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectViewEpochKey.js";
import {
	type CachedFullSubject,
	CachedFullSubjectSchema,
	cachedFullSubjectToNormalized,
	FULL_SUBJECT_CACHE_SCHEMA_VERSION,
} from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";
import { sanitizeCachedFullSubject } from "@/internal/customers/cache/fullSubject/sanitize/sanitizeCachedFullSubject.js";

async function readView({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) {
	const identity = { orgId: ctx.org.id, env: ctx.env, customerId };
	const result = await runRedisOp({
		operation: (redis) =>
			redis
				.multi()
				.get(buildFullSubjectKey(identity))
				.get(buildFullSubjectViewEpochKey(identity))
				.exec(),
		redisInstance: ctx.redisV2,
		source: "balance-shadow:read-view",
		retryOnStandby: false,
		useReadPool: false,
		timeoutMs: 2_000,
	});
	if (!result || result.length !== 2)
		throw new Error("Redis subject read failed");
	for (const [error] of result) if (error) throw error;
	const raw = result[0][1];
	const epoch = result[1][1];
	if (typeof raw !== "string")
		throw new Error("Redis cache is missing; refusing a Postgres baseline");
	if (
		typeof epoch !== "string" ||
		!/^\d+$/.test(epoch) ||
		!Number.isSafeInteger(Number(epoch))
	)
		throw new Error("Redis view epoch is missing or invalid");
	return { raw, epoch };
}

export async function readBalanceShadowSubject({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<FullSubject> {
	// Normal cache reads can reset or invalidate. Operator reads must do neither.
	const view = await readView({ ctx, customerId });
	const cached = sanitizeCachedFullSubject({
		cachedFullSubject: JSON.parse(view.raw) as CachedFullSubject,
	});
	CachedFullSubjectSchema.parse(cached);
	if (
		cached._schemaVersion !== FULL_SUBJECT_CACHE_SCHEMA_VERSION ||
		cached.subjectViewEpoch !== Number(view.epoch)
	)
		throw new Error("Redis subject schema or epoch is stale");
	if (
		cached.customerId !== customerId ||
		cached.customer.org_id !== ctx.org.id ||
		cached.customer.env !== ctx.env
	)
		throw new Error("Redis subject identity does not match the cohort");
	if (
		isRedisMigrationCacheStale({
			cachedAt: cached._cachedAt,
			customerId,
			redisConfig: ctx.org.redis_config,
		})
	)
		throw new Error("Redis subject predates a routing change");
	if (cached.usageWindowFeatureIds?.length)
		throw new Error("Usage windows are unsupported by the shadow");
	const customerEntitlements: SubjectBalance[] = [];
	for (const featureId of cached.meteredFeatures) {
		const customerEntitlementIds =
			cached.customerEntitlementIdsByFeatureId[featureId];
		if (!customerEntitlementIds?.length)
			throw new Error("Redis entitlement metadata is missing");
		const result = await getCachedFeatureBalance({
			ctx,
			customerId,
			featureId,
			customerEntitlementIds,
			readMaster: true,
		});
		if (result.kind !== "ok")
			throw new Error(`Redis balance is missing: ${result.reason}`);
		customerEntitlements.push(...result.value.balances);
	}
	const after = await readView({ ctx, customerId });
	if (view.raw !== after.raw || view.epoch !== after.epoch)
		throw new Error("Redis subject changed while reading balances");
	const fullSubject = normalizedToFullSubject({
		normalized: cachedFullSubjectToNormalized({ cached, customerEntitlements }),
	});
	fullSubject.subjectViewEpoch = cached.subjectViewEpoch;
	return fullSubject;
}
