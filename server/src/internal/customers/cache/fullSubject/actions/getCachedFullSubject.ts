import {
	type FullSubject,
	fullSubjectToFullCustomer,
	normalizedToFullSubject,
} from "@autumn/shared";
import { isRedisMigrationCacheStale } from "@/external/redis/customerRedisRouting.js";
import { throwOnPipelineConnectionError } from "@/external/redis/utils/pipelineErrors.js";
import { REDIS_OP_TIMEOUT_MS } from "@/external/redis/utils/redisOpTimeouts.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { lazyResetSubjectEntitlements } from "@/internal/customers/actions/resetCustomerEntitlementsV2/lazyResetSubjectEntitlements.js";
import { lazyResetSubjectUsageWindows } from "@/internal/customers/actions/resetUsageWindows/lazyResetSubjectUsageWindows.js";
import { checkPendingMigrationsForCustomer } from "@/internal/migrations/v2/lazy/checkPendingMigrationsForCustomer.js";
import { getFullSubjectRolloutSnapshot } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { isSnapshotCacheStale } from "@/internal/misc/rollouts/rolloutUtils.js";
import { applyLiveAggregatedBalances } from "../balances/applyLiveAggregatedBalances.js";
import { applyLiveUsageWindows } from "../balances/applyLiveUsageWindows.js";
import {
	type FeatureBalancesBatchRead,
	getCachedFeatureBalancesBatch,
} from "../balances/getCachedFeatureBalances.js";
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

const parseSubjectViewEpoch = ({
	epochRaw,
}: {
	epochRaw: string | null;
}): number => {
	const parsedEpoch =
		epochRaw !== null ? Number.parseInt(epochRaw, 10) : Number.NaN;
	return Number.isNaN(parsedEpoch) ? 0 : parsedEpoch;
};

const buildFeatureBalancesRead = ({
	cached,
	includeAggregated,
}: {
	cached: CachedFullSubject;
	includeAggregated: boolean;
}): FeatureBalancesBatchRead => {
	const usageWindowFeatureIds = new Set(cached.usageWindowFeatureIds ?? []);
	return {
		featureIds: [
			...new Set([...cached.meteredFeatures, ...usageWindowFeatureIds]),
		],
		customerEntitlementIdsByFeatureId: cached.customerEntitlementIdsByFeatureId,
		includeAggregated,
		usageWindowFeatureIds,
	};
};

export const getCachedFullSubject = async ({
	ctx,
	customerId,
	entityId,
	source,
	staleWhileRevalidate = false,
	runLazyResets = true,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
	staleWhileRevalidate?: boolean;
	runLazyResets?: boolean;
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

	let cached: CachedFullSubject | undefined;
	let currentSubjectViewEpoch = 0;

	if (!cached) {
		const pipelineResults = await runRedisOp({
			operation: async (redis) =>
				throwOnPipelineConnectionError(
					await redis.pipeline().get(subjectKey).get(epochKey).exec(),
				),
			source: "getCachedFullSubject:pipeline",
			redisInstance: redisV2,
			retryOnStandby: true,
			useReadPool: true,
			timeoutMs: REDIS_OP_TIMEOUT_MS.subjectPipeline,
		});

		const subjectEntry = pipelineResults?.[0];
		const epochEntry = pipelineResults?.[1];
		if (subjectEntry?.[0]) throw subjectEntry[0];
		if (epochEntry?.[0]) throw epochEntry[0];

		const cachedRaw = (subjectEntry?.[1] ?? null) as string | null;
		currentSubjectViewEpoch = parseSubjectViewEpoch({
			epochRaw: (epochEntry?.[1] ?? null) as string | null,
		});

		if (!cachedRaw) {
			return {
				fullSubject: undefined,
				subjectViewEpoch: currentSubjectViewEpoch,
			};
		}

		try {
			cached = sanitizeCachedFullSubject({
				cachedFullSubject: JSON.parse(cachedRaw) as CachedFullSubject,
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
	const balanceRead = buildFeatureBalancesRead({
		cached,
		includeAggregated: isCustomerSubject,
	});
	const balancesOutcome = await getCachedFeatureBalancesBatch({
		ctx,
		customerId,
		featureIds: balanceRead.featureIds,
		customerEntitlementIdsByFeatureId:
			balanceRead.customerEntitlementIdsByFeatureId,
		includeAggregated: balanceRead.includeAggregated,
		usageWindowFeatureIds: balanceRead.usageWindowFeatureIds,
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
	if (balances.length !== balanceRead.featureIds.length) {
		logger.warn(
			`[getCachedFullSubject] Incomplete cache for ${customerId}${entityId ? `:${entityId}` : ""}: expected ${balanceRead.featureIds.length} balance keys, got ${balances.length}. Rebuilding from DB, source: ${source}`,
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
		fullSubject.subjectViewEpoch = cached.subjectViewEpoch;
		if (runLazyResets) {
			await lazyResetSubjectEntitlements({ ctx, fullSubject });
			await lazyResetSubjectUsageWindows({ ctx, fullSubject, normalized });
			await checkPendingMigrationsForCustomer({
				ctx,
				fullCustomer: fullSubjectToFullCustomer({ fullSubject }),
			});
		}

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
