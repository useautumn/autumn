import type { FullSubject } from "@autumn/shared";
import { normalizedToFullSubject } from "@autumn/shared";
import { isRedisMigrationCacheStale } from "@/external/redis/customerRedisRouting.js";
import { throwOnPipelineConnectionError } from "@/external/redis/utils/pipelineErrors.js";
import { REDIS_OP_TIMEOUT_MS } from "@/external/redis/utils/redisOpTimeouts.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { lazyResetSubjectEntitlements } from "@/internal/customers/actions/resetCustomerEntitlementsV2/lazyResetSubjectEntitlements.js";
import { lazyResetSubjectUsageWindows } from "@/internal/customers/actions/resetUsageWindows/lazyResetSubjectUsageWindows.js";
import { getFullSubjectRolloutSnapshot } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { isSnapshotCacheStale } from "@/internal/misc/rollouts/rolloutUtils.js";
import { applyLiveAggregatedBalances } from "../../balances/applyLiveAggregatedBalances.js";
import { applyLiveUsageWindows } from "../../balances/applyLiveUsageWindows.js";
import {
	appendCachedFeatureBalanceReads,
	type FeatureBalancesBatchOutcome,
	type FeatureBalancesBatchRead,
	getCachedFeatureBalancesBatch,
	parseCachedFeatureBalanceReads,
} from "../../balances/getCachedFeatureBalances.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "../../builders/buildFullSubjectViewEpochKey.js";
import { filterNormalizedFullSubjectByFeatureIds } from "../../filterFullSubjectByFeatureIds.js";
import {
	type CachedFullSubject,
	cachedFullSubjectToNormalized,
	FULL_SUBJECT_CACHE_SCHEMA_VERSION,
} from "../../fullSubjectCacheModel.js";
import { sanitizeCachedFullSubject } from "../../sanitize/index.js";
import {
	deleteCachedStaticSubject,
	getCachedStaticSubject,
	setCachedStaticSubject,
} from "../../staticSubjectL1.js";
import { tryOrInvalidate } from "../../tryOrInvalidate.js";
import { invalidateCachedFullSubject } from "../invalidate/invalidateFullSubject.js";
import { invalidateCachedFullSubjectExact } from "../invalidate/invalidateFullSubjectExact.js";

const buildSubjectLabel = ({
	customerId,
	entityId,
}: {
	customerId: string;
	entityId?: string;
}) => (entityId ? `${customerId}:${entityId}` : customerId);

export type GetCachedPartialFullSubjectResult = {
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
	featureIds,
	includeAggregated,
}: {
	cached: CachedFullSubject;
	featureIds: string[];
	includeAggregated: boolean;
}): FeatureBalancesBatchRead => {
	const featureIdSet = new Set(featureIds);
	const usageWindowFeatureIds = new Set(
		(cached.usageWindowFeatureIds ?? []).filter((featureId) =>
			featureIdSet.has(featureId),
		),
	);
	return {
		featureIds: [
			...new Set([
				...cached.meteredFeatures.filter((featureId) =>
					featureIdSet.has(featureId),
				),
				...usageWindowFeatureIds,
			]),
		],
		customerEntitlementIdsByFeatureId: cached.customerEntitlementIdsByFeatureId,
		includeAggregated,
		usageWindowFeatureIds,
	};
};

export const getCachedPartialFullSubject = async ({
	ctx,
	customerId,
	entityId,
	featureIds,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	featureIds: string[];
	source?: string;
}): Promise<GetCachedPartialFullSubjectResult> => {
	const { org, env, redisV2 } = ctx;
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
	const subjectLabel = buildSubjectLabel({ customerId, entityId });

	const l1Cached = getCachedStaticSubject({ subjectKey });
	let cached = l1Cached;
	let cachedSerializedSize: number | undefined;
	let currentSubjectViewEpoch = 0;
	let prefetchedBalances: FeatureBalancesBatchOutcome | undefined;

	if (l1Cached) {
		const balanceRead = buildFeatureBalancesRead({
			cached: l1Cached,
			featureIds,
			includeAggregated: !entityId,
		});
		const pipelineResults = await runRedisOp({
			operation: async (redis) => {
				const pipeline = redis.pipeline().exists(subjectKey).get(epochKey);
				appendCachedFeatureBalanceReads({
					pipeline,
					orgId: org.id,
					env,
					customerId,
					read: balanceRead,
				});
				return throwOnPipelineConnectionError(await pipeline.exec());
			},
			source: "getCachedPartialFullSubject:l1-pipeline",
			redisInstance: redisV2,
			retryOnStandby: true,
			useReadPool: true,
			timeoutMs: REDIS_OP_TIMEOUT_MS.subjectPipeline,
		});

		const subjectExistsEntry = pipelineResults?.[0];
		const epochEntry = pipelineResults?.[1];
		if (subjectExistsEntry?.[0]) throw subjectExistsEntry[0];
		if (epochEntry?.[0]) throw epochEntry[0];
		const subjectExists = Number(subjectExistsEntry?.[1] ?? 0) === 1;
		currentSubjectViewEpoch = parseSubjectViewEpoch({
			epochRaw: (epochEntry?.[1] ?? null) as string | null,
		});
		if (
			pipelineResults &&
			subjectExists &&
			l1Cached.subjectViewEpoch === currentSubjectViewEpoch
		) {
			cached = structuredClone(l1Cached);
			prefetchedBalances = parseCachedFeatureBalanceReads({
				results: pipelineResults.slice(2),
				read: balanceRead,
			});
			ctx.extraLogs.partialSubjectStaticL1Hit = true;
		} else {
			deleteCachedStaticSubject({ subjectKey });
			cached = undefined;
		}
	}

	if (!cached) {
		const pipelineResults = await runRedisOp({
			operation: async (redis) =>
				throwOnPipelineConnectionError(
					await redis.pipeline().get(subjectKey).get(epochKey).exec(),
				),
			source: "getCachedPartialFullSubject:pipeline",
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

		cached = await tryOrInvalidate({
			ctx,
			operation: () =>
				sanitizeCachedFullSubject({
					cachedFullSubject: JSON.parse(cachedRaw) as CachedFullSubject,
				}),
			invalidate: () =>
				invalidateCachedFullSubject({
					ctx,
					customerId,
					entityId,
					source: "partial-parse-failed",
				}),
			warnMessage: `[getCachedPartialFullSubject] Failed to parse cached subject for ${subjectLabel}, source: ${source}`,
		});
		if (!cached) {
			return {
				fullSubject: undefined,
				subjectViewEpoch: currentSubjectViewEpoch,
			};
		}
		cachedSerializedSize = cachedRaw.length;
	}

	const epochOk = await tryOrInvalidate({
		ctx,
		operation: () =>
			cached.subjectViewEpoch === currentSubjectViewEpoch
				? currentSubjectViewEpoch
				: undefined,
		invalidate: () =>
			invalidateCachedFullSubjectExact({
				ctx,
				customerId,
				entityId,
				source: "partial-stale-subject-view-epoch",
			}),
		warnMessage: `[getCachedPartialFullSubject] Stale subject view epoch for ${subjectLabel}, cached=${cached.subjectViewEpoch}, current=${currentSubjectViewEpoch}, source: ${source}`,
	});
	if (epochOk === undefined) {
		return {
			fullSubject: undefined,
			subjectViewEpoch: currentSubjectViewEpoch,
		};
	}

	const schemaOk = await tryOrInvalidate({
		ctx,
		operation: () =>
			cached._schemaVersion === FULL_SUBJECT_CACHE_SCHEMA_VERSION
				? true
				: undefined,
		invalidate: () =>
			invalidateCachedFullSubjectExact({
				ctx,
				customerId,
				entityId,
				source: "partial-stale-subject-schema-version",
			}),
		warnMessage: `[getCachedPartialFullSubject] Stale subject schema version for ${subjectLabel}, cached=${cached._schemaVersion ?? "missing"}, current=${FULL_SUBJECT_CACHE_SCHEMA_VERSION}, source=${source}`,
	});
	if (schemaOk === undefined) {
		return {
			fullSubject: undefined,
			subjectViewEpoch: currentSubjectViewEpoch,
		};
	}

	const rolloutSnapshot = getFullSubjectRolloutSnapshot({ ctx });
	const rolloutOk = await tryOrInvalidate({
		ctx,
		operation: () => {
			const stale =
				rolloutSnapshot &&
				isSnapshotCacheStale({
					snapshot: rolloutSnapshot,
					cachedAt: cached._cachedAt,
				});
			return stale ? undefined : true;
		},
		invalidate: () =>
			invalidateCachedFullSubject({
				ctx,
				customerId,
				entityId,
				source: "stale-rollout",
			}),
		warnMessage: `[getCachedPartialFullSubject] Stale rollout cache for ${subjectLabel}, evicting`,
	});
	if (rolloutOk === undefined) {
		return {
			fullSubject: undefined,
			subjectViewEpoch: currentSubjectViewEpoch,
		};
	}

	const redisMigrationOk = await tryOrInvalidate({
		ctx,
		operation: () =>
			isRedisMigrationCacheStale({
				cachedAt: cached._cachedAt,
				customerId,
				redisConfig: ctx.org.redis_config,
			})
				? undefined
				: true,
		invalidate: () =>
			invalidateCachedFullSubject({
				ctx,
				customerId,
				entityId,
				source: "partial-stale-redis-migration",
			}),
		warnMessage: `[getCachedPartialFullSubject] Stale Redis migration cache for ${subjectLabel}, evicting`,
	});
	if (redisMigrationOk === undefined) {
		return {
			fullSubject: undefined,
			subjectViewEpoch: currentSubjectViewEpoch,
		};
	}

	if (cachedSerializedSize !== undefined) {
		setCachedStaticSubject({
			subjectKey,
			cached: structuredClone(cached),
			serializedSize: cachedSerializedSize,
		});
	}

	const balanceRead = buildFeatureBalancesRead({
		cached,
		featureIds,
		includeAggregated: !entityId,
	});

	const isCustomerSubject = !entityId;
	const featureBalancesOutcome =
		prefetchedBalances ??
		(await getCachedFeatureBalancesBatch({
			ctx,
			customerId,
			featureIds: balanceRead.featureIds,
			customerEntitlementIdsByFeatureId:
				balanceRead.customerEntitlementIdsByFeatureId,
			includeAggregated: isCustomerSubject,
			usageWindowFeatureIds: balanceRead.usageWindowFeatureIds,
		}));

	const invalidateIncomplete = () =>
		invalidateCachedFullSubjectExact({
			ctx,
			customerId,
			entityId,
			source: "partial-incomplete",
		});

	const balancesPresent = await tryOrInvalidate({
		ctx,
		operation: () =>
			featureBalancesOutcome.kind === "missing"
				? undefined
				: featureBalancesOutcome.value,
		invalidate: invalidateIncomplete,
		warnMessage: `[getCachedPartialFullSubject] Incomplete cache for ${subjectLabel}, source: ${source}, reason: ${featureBalancesOutcome.kind === "missing" ? featureBalancesOutcome.reason : "n/a"}`,
	});
	if (balancesPresent === undefined) {
		return {
			fullSubject: undefined,
			subjectViewEpoch: currentSubjectViewEpoch,
		};
	}

	const featureBalances = await tryOrInvalidate({
		ctx,
		operation: () =>
			balancesPresent.length === balanceRead.featureIds.length
				? balancesPresent
				: undefined,
		invalidate: invalidateIncomplete,
		warnMessage: `[getCachedPartialFullSubject] Incomplete cache (length mismatch) for ${subjectLabel}, source: ${source}`,
	});
	if (featureBalances === undefined) {
		return {
			fullSubject: undefined,
			subjectViewEpoch: currentSubjectViewEpoch,
		};
	}

	const customerEntitlements = featureBalances.flatMap(
		(featureBalance) => featureBalance.balances,
	);

	const hydrated = await tryOrInvalidate({
		ctx,
		operation: async () => {
			const normalized = filterNormalizedFullSubjectByFeatureIds({
				normalized: cachedFullSubjectToNormalized({
					cached,
					customerEntitlements,
				}),
				featureIds,
			});

			if (isCustomerSubject) {
				applyLiveAggregatedBalances({
					normalized,
					featureBalances,
				});
			}

			applyLiveUsageWindows({
				normalized,
				featureBalances,
			});

			const fullSubject = normalizedToFullSubject({ normalized });
			await lazyResetSubjectEntitlements({ ctx, fullSubject, normalized });
			await lazyResetSubjectUsageWindows({ ctx, fullSubject, normalized });
			return fullSubject;
		},
		invalidate: () =>
			invalidateCachedFullSubjectExact({
				ctx,
				customerId,
				entityId,
				source: "partial-hydrate-failed",
			}),
		warnMessage: `[getCachedPartialFullSubject] Failed to hydrate cached subject for ${subjectLabel}, source: ${source}`,
	});

	return { fullSubject: hydrated, subjectViewEpoch: currentSubjectViewEpoch };
};
