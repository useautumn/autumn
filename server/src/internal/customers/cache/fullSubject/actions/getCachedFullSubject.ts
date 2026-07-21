import {
	type FullSubject,
	fullSubjectToFullCustomer,
	normalizedToFullSubject,
} from "@autumn/shared";
import { isRedisMigrationCacheStale } from "@/external/redis/customerRedisRouting.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CustomerBalanceSyncDb } from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";
import { lazyResetSubjectEntitlements } from "@/internal/customers/actions/resetCustomerEntitlementsV2/lazyResetSubjectEntitlements.js";
import { lazyResetSubjectUsageWindows } from "@/internal/customers/actions/resetUsageWindows/lazyResetSubjectUsageWindows.js";
import { checkPendingMigrationsForCustomer } from "@/internal/migrations/v2/lazy/checkPendingMigrationsForCustomer.js";
import { getFullSubjectRolloutSnapshot } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { isSnapshotCacheStale } from "@/internal/misc/rollouts/rolloutUtils.js";
import { applyLiveAggregatedBalances } from "../balances/applyLiveAggregatedBalances.js";
import { applyLiveUsageWindows } from "../balances/applyLiveUsageWindows.js";
import { getCachedFeatureBalancesBatch } from "../balances/getCachedFeatureBalances.js";
import { buildFullSubjectKey } from "../builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "../builders/buildFullSubjectViewEpochKey.js";
import {
	type CachedFullSubject,
	cachedFullSubjectToNormalized,
	FULL_SUBJECT_CACHE_SCHEMA_VERSION,
} from "../fullSubjectCacheModel.js";
import { sanitizeCachedFullSubject } from "../sanitize/index.js";
import { invalidateCachedFullSubject } from "./invalidate/invalidateFullSubject.js";
import { invalidateCachedFullSubjectExact } from "./invalidate/invalidateFullSubjectExact.js";
import { shouldWarmCache } from "./warmFullSubjectCache.js";

export type GetCachedFullSubjectResult = {
	fullSubject: FullSubject | undefined;
	subjectViewEpoch: number;
};

export const getCachedFullSubject = async ({
	ctx,
	customerId,
	entityId,
	source,
	staleWhileRevalidate = false,
	balanceSyncDb,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
	staleWhileRevalidate?: boolean;
	/** Existing customer balance-sync transaction. Used by cache-miss rebuilds
	 * so a due pooled reset does not wait on its own advisory lock. */
	balanceSyncDb?: CustomerBalanceSyncDb;
}): Promise<GetCachedFullSubjectResult> => {
	const { org, env, logger, redisV2 } = ctx;
	const subjectKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});
	const epochKey = buildFullSubjectViewEpochKey({
		orgId: org.id,
		env,
		customerId,
	});

	// Subject + epoch keys share the `{customerId}` hash tag and live on the
	// same Redis slot, so a single pipeline fetches both in one round trip.
	// Read-only GETs — epoch TTL is refreshed on writes (setCachedFullSubject
	// Lua) and on invalidations, not on reads, to avoid write amplification.
	const pipelineResults = await runRedisOp({
		operation: () => redisV2.pipeline().get(subjectKey).get(epochKey).exec(),
		source: "getCachedFullSubject:pipeline",
		redisInstance: redisV2,
	});

	const subjectEntry = pipelineResults?.[0];
	const epochEntry = pipelineResults?.[1];
	if (subjectEntry?.[0]) throw subjectEntry[0];
	if (epochEntry?.[0]) throw epochEntry[0];

	const cachedRaw = (subjectEntry?.[1] ?? null) as string | null;
	const epochRaw = (epochEntry?.[1] ?? null) as string | null;

	// Missing epoch key is treated as 0; the next invalidation will INCR it
	// from missing to 1, which mismatches any cached subject written at 0.
	const parsedEpoch =
		epochRaw !== null ? Number.parseInt(epochRaw, 10) : Number.NaN;
	const currentSubjectViewEpoch = Number.isNaN(parsedEpoch) ? 0 : parsedEpoch;

	if (!cachedRaw) {
		return {
			fullSubject: undefined,
			subjectViewEpoch: currentSubjectViewEpoch,
		};
	}

	let cached: CachedFullSubject;
	try {
		const parsedCached = JSON.parse(cachedRaw) as CachedFullSubject;
		cached = sanitizeCachedFullSubject({
			cachedFullSubject: parsedCached,
		});
	} catch (error) {
		logger.warn(
			`[getCachedFullSubject] Failed to parse cached subject for ${customerId}${entityId ? `:${entityId}` : ""}, source: ${source}, error: ${error}`,
		);
		await invalidateCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source: "parse-failed",
		});
		return {
			fullSubject: undefined,
			subjectViewEpoch: currentSubjectViewEpoch,
		};
	}

	if (cached.subjectViewEpoch !== currentSubjectViewEpoch) {
		// Allow-listed high-cardinality customers serve the stale subject and
		// rehydrate via the warm task, instead of rebuilding 10k+ entities
		// inline on every reader.
		if (staleWhileRevalidate && shouldWarmCache(customerId)) {
			logger.warn(
				`[getCachedFullSubject] Serving stale-while-revalidate for ${customerId}${entityId ? `:${entityId}` : ""}, cached= ${cached.subjectViewEpoch}, current= ${currentSubjectViewEpoch}, source: ${source}`,
			);
		} else {
			logger.warn(
				`[getCachedFullSubject] Stale subject view epoch for ${customerId}${entityId ? `:${entityId}` : ""}, cached=${cached.subjectViewEpoch}, current= ${currentSubjectViewEpoch}, source: ${source}`,
			);
			await invalidateCachedFullSubjectExact({
				ctx,
				customerId,
				entityId,
				source: "stale-subject-view-epoch",
			});
			return {
				fullSubject: undefined,
				subjectViewEpoch: currentSubjectViewEpoch,
			};
		}
	}

	if (cached._schemaVersion !== FULL_SUBJECT_CACHE_SCHEMA_VERSION) {
		logger.warn(
			`[getCachedFullSubject] Stale subject schema version for ${customerId}${entityId ? `:${entityId}` : ""}, cached=${cached._schemaVersion ?? "missing"}, current=${FULL_SUBJECT_CACHE_SCHEMA_VERSION}, source: ${source}`,
		);
		await invalidateCachedFullSubjectExact({
			ctx,
			customerId,
			entityId,
			source: "stale-subject-schema-version",
		});
		return {
			fullSubject: undefined,
			subjectViewEpoch: currentSubjectViewEpoch,
		};
	}

	const rolloutSnapshot = getFullSubjectRolloutSnapshot({ ctx });
	if (
		rolloutSnapshot &&
		isSnapshotCacheStale({
			snapshot: rolloutSnapshot,
			cachedAt: cached._cachedAt,
		})
	) {
		logger.warn(
			`[getCachedFullSubject] Stale rollout cache for ${customerId}${entityId ? `:${entityId}` : ""}, evicting`,
		);
		await invalidateCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source: "stale-rollout",
		});
		return {
			fullSubject: undefined,
			subjectViewEpoch: currentSubjectViewEpoch,
		};
	}

	if (
		isRedisMigrationCacheStale({
			cachedAt: cached._cachedAt,
			customerId,
			redisConfig: ctx.org.redis_config,
		})
	) {
		logger.warn(
			`[getCachedFullSubject] Stale Redis migration cache for ${customerId}${entityId ? `:${entityId}` : ""}, evicting`,
		);
		await invalidateCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source: "stale-redis-migration",
		});
		return {
			fullSubject: undefined,
			subjectViewEpoch: currentSubjectViewEpoch,
		};
	}

	const isCustomerSubject = !entityId;
	// Capped features may have no entitlements, so they aren't guaranteed to be
	// in meteredFeatures; union them in so their `_usage_windows` field is read.
	const usageWindowFeatureIds = new Set(cached.usageWindowFeatureIds ?? []);
	const batchFeatureIds = [
		...new Set([...cached.meteredFeatures, ...usageWindowFeatureIds]),
	];
	const balancesOutcome = await getCachedFeatureBalancesBatch({
		ctx,
		customerId,
		featureIds: batchFeatureIds,
		customerEntitlementIdsByFeatureId: cached.customerEntitlementIdsByFeatureId,
		includeAggregated: isCustomerSubject,
		usageWindowFeatureIds,
	});

	if (balancesOutcome.kind === "missing") {
		logger.warn(
			`[getCachedFullSubject] Incomplete cache for ${customerId}${entityId ? `:${entityId}` : ""}: expected ${cached.meteredFeatures.length} balance keys, rebuilding from DB, source: ${source}`,
		);
		await invalidateCachedFullSubjectExact({
			ctx,
			customerId,
			entityId,
			source: "incomplete-shared-balances",
		});
		return {
			fullSubject: undefined,
			subjectViewEpoch: currentSubjectViewEpoch,
		};
	}

	const balances = balancesOutcome.value;
	if (balances.length !== batchFeatureIds.length) {
		logger.warn(
			`[getCachedFullSubject] Incomplete cache for ${customerId}${entityId ? `:${entityId}` : ""}: expected ${batchFeatureIds.length} balance keys, got ${balances.length}. Rebuilding from DB, source: ${source}`,
		);
		await invalidateCachedFullSubjectExact({
			ctx,
			customerId,
			entityId,
			source: "incomplete-shared-balances",
		});
		return {
			fullSubject: undefined,
			subjectViewEpoch: currentSubjectViewEpoch,
		};
	}

	try {
		const normalized = cachedFullSubjectToNormalized({
			cached,
			customerEntitlements: balances.flatMap((balance) => balance.balances),
		});

		if (isCustomerSubject) {
			applyLiveAggregatedBalances({
				normalized,
				featureBalances: balances,
			});
		}

		applyLiveUsageWindows({
			normalized,
			featureBalances: balances,
		});

		const fullSubject = normalizedToFullSubject({ normalized });
		await lazyResetSubjectEntitlements({ ctx, fullSubject, balanceSyncDb });
		await lazyResetSubjectUsageWindows({ ctx, fullSubject, normalized });
		await checkPendingMigrationsForCustomer({
			ctx,
			fullCustomer: fullSubjectToFullCustomer({ fullSubject }),
		});
		return { fullSubject, subjectViewEpoch: currentSubjectViewEpoch };
	} catch (error) {
		logger.warn(
			`[getCachedFullSubject] Failed to hydrate cached subject for ${customerId}${entityId ? `:${entityId}` : ""}, source: ${source}, error: ${error}`,
		);
		await invalidateCachedFullSubjectExact({
			ctx,
			customerId,
			entityId,
			source: "hydrate-failed",
		});
		return {
			fullSubject: undefined,
			subjectViewEpoch: currentSubjectViewEpoch,
		};
	}
};
