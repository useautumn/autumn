import type { FullSubject } from "@autumn/shared";
import { normalizedToFullSubject } from "@autumn/shared";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { lazyResetSubjectEntitlements } from "@/internal/customers/actions/resetCustomerEntitlementsV2/lazyResetSubjectEntitlements.js";
import { getFullSubjectRolloutSnapshot } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { isSnapshotCacheStale } from "@/internal/misc/rollouts/rolloutUtils.js";
import { applyLiveAggregatedBalances } from "../../balances/applyLiveAggregatedBalances.js";
import { getCachedFeatureBalancesBatch } from "../../balances/getCachedFeatureBalances.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "../../builders/buildFullSubjectViewEpochKey.js";
import { filterNormalizedFullSubjectByFeatureIds } from "../../filterFullSubjectByFeatureIds.js";
import {
	type CachedFullSubject,
	cachedFullSubjectToNormalized,
} from "../../fullSubjectCacheModel.js";
import { sanitizeCachedFullSubject } from "../../sanitize/index.js";
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

	// Subject + epoch keys share the `{customerId}` hash tag and live on the
	// same Redis slot, so a single pipeline fetches both in one round trip.
	// Read-only GETs — epoch TTL is refreshed on writes (setCachedFullSubject
	// Lua) and on invalidations, not on reads, to avoid write amplification.
	const pipelineResults = await runRedisOp({
		operation: () => redisV2.pipeline().get(subjectKey).get(epochKey).exec(),
		source: "getCachedPartialFullSubject:pipeline",
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

	const cached = await tryOrInvalidate({
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

	const meteredFeatureIdsToFetch = featureIds.filter((featureId) =>
		cached.meteredFeatures.includes(featureId),
	);

	const isCustomerSubject = !entityId;
	const featureBalancesOutcome = await getCachedFeatureBalancesBatch({
		ctx,
		customerId,
		featureIds: meteredFeatureIdsToFetch,
		customerEntitlementIdsByFeatureId: cached.customerEntitlementIdsByFeatureId,
		includeAggregated: isCustomerSubject,
	});

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
		warnMessage: `[getCachedPartialFullSubject] Incomplete cache for ${subjectLabel}, source: ${source}`,
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
			balancesPresent.length === meteredFeatureIdsToFetch.length
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

			const fullSubject = normalizedToFullSubject({ normalized });
			await lazyResetSubjectEntitlements({ ctx, fullSubject, normalized });
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
