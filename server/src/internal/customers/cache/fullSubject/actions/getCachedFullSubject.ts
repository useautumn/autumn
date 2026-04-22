import { type FullSubject, normalizedToFullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { lazyResetSubjectEntitlements } from "@/internal/customers/actions/resetCustomerEntitlementsV2/lazyResetSubjectEntitlements.js";
import { getFullSubjectRolloutSnapshot } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { isSnapshotCacheStale } from "@/internal/misc/rollouts/rolloutUtils.js";
import { runRedisOp } from "@/utils/cacheUtils/runRedisOp.js";
import { applyLiveAggregatedBalances } from "../balances/applyLiveAggregatedBalances.js";
import { getCachedFeatureBalancesBatch } from "../balances/getCachedFeatureBalances.js";
import { buildFullSubjectKey } from "../builders/buildFullSubjectKey.js";
import {
	type CachedFullSubject,
	cachedFullSubjectToNormalized,
} from "../fullSubjectCacheModel.js";
import { sanitizeCachedFullSubject } from "../sanitize/index.js";
import { getOrInitFullSubjectViewEpoch } from "./invalidate/getOrInitFullSubjectViewEpoch.js";
import { invalidateCachedFullSubject } from "./invalidate/invalidateFullSubject.js";
import { invalidateCachedFullSubjectExact } from "./invalidate/invalidateFullSubjectExact.js";

export const getCachedFullSubject = async ({
	ctx,
	customerId,
	entityId,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
}): Promise<FullSubject | undefined> => {
	const { org, env, logger, redisV2 } = ctx;
	const subjectKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});

	const outcome = await runRedisOp({
		operation: () => redisV2.get(subjectKey),
		source: "getCachedFullSubject",
		redisInstance: redisV2,
	});

	if (outcome.kind === "unavailable") return undefined;
	const cachedRaw = outcome.value;
	if (!cachedRaw) return undefined;

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
		return undefined;
	}

	const currentSubjectViewEpoch = await getOrInitFullSubjectViewEpoch({
		ctx,
		customerId,
	});
	if (cached.subjectViewEpoch !== currentSubjectViewEpoch) {
		logger.warn(
			`[getCachedFullSubject] Stale subject view epoch for ${customerId}${entityId ? `:${entityId}` : ""}, cached=${cached.subjectViewEpoch}, current=${currentSubjectViewEpoch}, source: ${source}`,
		);
		await invalidateCachedFullSubjectExact({
			ctx,
			customerId,
			entityId,
			source: "stale-subject-view-epoch",
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
			`[getCachedFullSubject] Stale rollout cache for ${customerId}${entityId ? `:${entityId}` : ""}, evicting`,
		);
		await invalidateCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source: "stale-rollout",
		});
		return undefined;
	}

	const isCustomerSubject = !entityId;
	const balancesOutcome = await getCachedFeatureBalancesBatch({
		ctx,
		customerId,
		featureIds: cached.meteredFeatures,
		customerEntitlementIdsByFeatureId: cached.customerEntitlementIdsByFeatureId,
		includeAggregated: isCustomerSubject,
	});

	if (balancesOutcome.kind === "unavailable") {
		// Redis was unreachable for the balance batch. DO NOT invalidate the
		// full subject — that would bump viewEpoch and cascade a thundering-herd
		// rebuild across every pod for this customer. Just let this one caller
		// fall through to DB; concurrent readers that succeeded keep their cache.
		logger.warn(
			`[getCachedFullSubject] Balance batch unavailable for ${customerId}${entityId ? `:${entityId}` : ""}, falling back without invalidation, source: ${source}`,
		);
		return undefined;
	}

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
		return undefined;
	}

	const balances = balancesOutcome.value;
	if (balances.length !== cached.meteredFeatures.length) {
		logger.warn(
			`[getCachedFullSubject] Incomplete cache for ${customerId}${entityId ? `:${entityId}` : ""}: expected ${cached.meteredFeatures.length} balance keys, got ${balances.length}. Rebuilding from DB, source: ${source}`,
		);
		await invalidateCachedFullSubjectExact({
			ctx,
			customerId,
			entityId,
			source: "incomplete-shared-balances",
		});
		return undefined;
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

		const fullSubject = normalizedToFullSubject({ normalized });
		await lazyResetSubjectEntitlements({ ctx, fullSubject });
		return fullSubject;
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
		return undefined;
	}
};
