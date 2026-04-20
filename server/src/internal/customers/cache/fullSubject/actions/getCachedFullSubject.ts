import { type FullSubject, normalizedToFullSubject } from "@autumn/shared";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { lazyResetSubjectEntitlements } from "@/internal/customers/actions/resetCustomerEntitlementsV2/lazyResetSubjectEntitlements.js";
import { getFullSubjectRolloutSnapshot } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { isSnapshotCacheStale } from "@/internal/misc/rollouts/rolloutUtils.js";
import { tryRedisRead } from "@/utils/cacheUtils/cacheUtils.js";
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
	const { org, env, logger } = ctx;
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
	const balances = await getCachedFeatureBalancesBatch({
		orgId: org.id,
		env,
		customerId,
		featureIds: cached.meteredFeatures,
		customerEntitlementIdsByFeatureId: cached.customerEntitlementIdsByFeatureId,
		includeAggregated: isCustomerSubject,
	});

	if (!balances || balances.length !== cached.meteredFeatures.length) {
		logger.warn(
			`[getCachedFullSubject] Incomplete cache for ${customerId}${entityId ? `:${entityId}` : ""}: expected ${cached.meteredFeatures.length} balance keys, got ${balances?.length ?? 0}. Rebuilding from DB, source: ${source}`,
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
