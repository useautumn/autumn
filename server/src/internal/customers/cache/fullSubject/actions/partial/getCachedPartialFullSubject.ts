import type { FullSubject } from "@autumn/shared";
import { normalizedToFullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { lazyResetSubjectEntitlements } from "@/internal/customers/actions/resetCustomerEntitlementsV2/lazyResetSubjectEntitlements.js";
import { getFullSubjectRolloutSnapshot } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { isSnapshotCacheStale } from "@/internal/misc/rollouts/rolloutUtils.js";
import { tryRedisRead } from "@/utils/cacheUtils/cacheUtils.js";
import { applyLiveAggregatedBalances } from "../../balances/applyLiveAggregatedBalances.js";
import { getCachedFeatureBalancesBatch } from "../../balances/getCachedFeatureBalances.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { filterNormalizedFullSubjectByFeatureIds } from "../../filterFullSubjectByFeatureIds.js";
import {
	type CachedFullSubject,
	cachedFullSubjectToNormalized,
} from "../../fullSubjectCacheModel.js";
import { sanitizeCachedFullSubject } from "../../sanitize/index.js";
import { getOrInitFullSubjectViewEpoch } from "../invalidate/getOrInitFullSubjectViewEpoch.js";
import { invalidateCachedFullSubject } from "../invalidate/invalidateFullSubject.js";
import { invalidateCachedFullSubjectExact } from "../invalidate/invalidateFullSubjectExact.js";

const invalidatePartialFullSubject = async ({
	ctx,
	customerId,
	entityId,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source: string;
}) => {
	await invalidateCachedFullSubject({
		ctx,
		customerId,
		entityId,
		source,
	});
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
}): Promise<FullSubject | undefined> => {
	const { org, env, logger, redisV2 } = ctx;
	const subjectKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});

	const cachedRaw = await tryRedisRead(() => redisV2.get(subjectKey), redisV2);
	if (!cachedRaw) return undefined;

	let cached: CachedFullSubject;
	try {
		const parsedCached = JSON.parse(cachedRaw) as CachedFullSubject;
		cached = sanitizeCachedFullSubject({
			cachedFullSubject: parsedCached,
		});
	} catch (error) {
		logger.warn(
			`[getCachedPartialFullSubject] Failed to parse cached subject for ${customerId}${entityId ? `:${entityId}` : ""}, source: ${source}, error: ${error}`,
		);
		await invalidatePartialFullSubject({
			ctx,
			customerId,
			entityId,
			source: "partial-parse-failed",
		});
		return undefined;
	}

	const currentSubjectViewEpoch = await getOrInitFullSubjectViewEpoch({
		ctx,
		customerId,
	});
	if (cached.subjectViewEpoch !== currentSubjectViewEpoch) {
		logger.warn(
			`[getCachedPartialFullSubject] Stale subject view epoch for ${customerId}${entityId ? `:${entityId}` : ""}, cached=${cached.subjectViewEpoch}, current=${currentSubjectViewEpoch}, source: ${source}`,
		);
		await invalidateCachedFullSubjectExact({
			ctx,
			customerId,
			entityId,
			source: "partial-stale-subject-view-epoch",
		});
		return undefined;
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
			`[getCachedPartialFullSubject] Stale rollout cache for ${customerId}${entityId ? `:${entityId}` : ""}, evicting`,
		);
		await invalidatePartialFullSubject({
			ctx,
			customerId,
			entityId,
			source: "stale-rollout",
		});
		return undefined;
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

	if (featureBalancesOutcome.kind === "unavailable") {
		// Transient Redis failure. DO NOT bump viewEpoch — that would cascade a
		// rebuild across every pod for this customer. Fall through to DB for
		// this caller only.
		logger.warn(
			`[getCachedPartialFullSubject] Balance batch unavailable for ${customerId}${entityId ? `:${entityId}` : ""}, falling back without invalidation, source: ${source}`,
		);
		return undefined;
	}

	if (featureBalancesOutcome.kind === "missing") {
		logger.warn(
			`[getCachedPartialFullSubject] Incomplete cache for ${customerId}${entityId ? `:${entityId}` : ""}, source: ${source}`,
		);
		await invalidateCachedFullSubjectExact({
			ctx,
			customerId,
			entityId,
			source: "partial-incomplete",
		});
		return undefined;
	}

	const featureBalances = featureBalancesOutcome.value;
	if (featureBalances.length !== meteredFeatureIdsToFetch.length) {
		logger.warn(
			`[getCachedPartialFullSubject] Incomplete cache (length mismatch) for ${customerId}${entityId ? `:${entityId}` : ""}, source: ${source}`,
		);
		await invalidateCachedFullSubjectExact({
			ctx,
			customerId,
			entityId,
			source: "partial-incomplete",
		});
		return undefined;
	}

	const customerEntitlements = featureBalances.flatMap(
		(featureBalance) => featureBalance.balances,
	);

	try {
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
	} catch (error) {
		logger.warn(
			`[getCachedPartialFullSubject] Failed to hydrate cached subject for ${customerId}${entityId ? `:${entityId}` : ""}, source: ${source}, error: ${error}`,
		);
		await invalidateCachedFullSubjectExact({
			ctx,
			customerId,
			entityId,
			source: "partial-hydrate-failed",
		});
		return undefined;
	}
};
