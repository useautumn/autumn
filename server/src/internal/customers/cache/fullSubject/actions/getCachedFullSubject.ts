import { type FullSubject, normalizedToFullSubject } from "@autumn/shared";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectRolloutSnapshot } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { isSnapshotCacheStale } from "@/internal/misc/rollouts/rolloutUtils.js";
import { tryRedisRead } from "@/utils/cacheUtils/cacheUtils.js";
import { getCachedFeatureBalancesBatch } from "../balances/getCachedFeatureBalances.js";
import { buildFullSubjectKey } from "../builders/buildFullSubjectKey.js";
import {
	type CachedFullSubject,
	cachedFullSubjectToNormalized,
} from "../fullSubjectCacheModel.js";
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
		cached = JSON.parse(cachedRaw) as CachedFullSubject;
	} catch (error) {
		logger.warn(
			`[getCachedFullSubject] Failed to parse cached subject for ${customerId}${entityId ? `:${entityId}` : ""}, source: ${source}, error: ${error}`,
		);
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

	const balances = await getCachedFeatureBalancesBatch({
		orgId: org.id,
		env,
		customerId,
		featureIds: cached.meteredFeatures,
		customerEntitlementIdsByFeatureId: cached.customerEntitlementIdsByFeatureId,
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

	const normalized = cachedFullSubjectToNormalized({
		cached,
		customerEntitlements: balances.flatMap((balance) => balance.balances),
	});

	return normalizedToFullSubject({ normalized });
};
