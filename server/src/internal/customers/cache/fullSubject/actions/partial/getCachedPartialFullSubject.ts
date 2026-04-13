import type { FullSubject, SubjectBalance } from "@autumn/shared";
import { normalizedToFullSubject } from "@autumn/shared";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectRolloutSnapshot } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { isSnapshotCacheStale } from "@/internal/misc/rollouts/rolloutUtils.js";
import { tryRedisRead } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectBalanceKey } from "../../builders/buildFullSubjectBalanceKey.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { filterNormalizedFullSubjectByFeatureIds } from "../../filterFullSubjectByFeatureIds.js";
import {
	type CachedFullSubject,
	cachedFullSubjectToNormalized,
} from "../../fullSubjectCacheModel.js";
import { getOrInitFullSubjectCustomerEpoch } from "../invalidate/getOrInitFullSubjectCustomerEpoch.js";
import { invalidateCachedFullSubject } from "../invalidate/invalidateFullSubject.js";
import { invalidateCachedFullSubjectExact } from "../invalidate/invalidateFullSubjectExact.js";

type BalanceHashMeta = {
	featureId: string;
	customerEntitlementIds: string[];
};

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

const getStrictFeatureBalances = async ({
	ctx,
	customerId,
	entityId,
	featureIds,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	featureIds: string[];
}): Promise<SubjectBalance[] | undefined> => {
	const { org, env } = ctx;
	if (featureIds.length === 0) return [];

	const pipeline = redisV2.pipeline();
	for (const featureId of featureIds) {
		pipeline.hgetall(
			buildFullSubjectBalanceKey({
				orgId: org.id,
				env,
				customerId,
				entityId,
				featureId,
			}),
		);
	}

	const results = await tryRedisRead(() => pipeline.exec(), redisV2);
	if (!results) return undefined;

	const balances: SubjectBalance[] = [];

	for (let i = 0; i < featureIds.length; i++) {
		const fields = results[i]?.[1] as Record<string, string> | null;
		if (!fields?._meta) return undefined;

		let meta: BalanceHashMeta;
		try {
			meta = JSON.parse(fields._meta) as BalanceHashMeta;
		} catch {
			return undefined;
		}

		for (const customerEntitlementId of meta.customerEntitlementIds) {
			const entryJson = fields[customerEntitlementId];
			if (!entryJson) return undefined;

			try {
				balances.push(JSON.parse(entryJson) as SubjectBalance);
			} catch {
				return undefined;
			}
		}
	}

	return balances;
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

	if (entityId) {
		const currentCustomerEpoch = await getOrInitFullSubjectCustomerEpoch({
			ctx,
			customerId,
		});
		if (cached.customerEntityEpoch !== currentCustomerEpoch) {
			logger.warn(
				`[getCachedPartialFullSubject] Stale customer entity epoch for ${customerId}:${entityId}, cached=${cached.customerEntityEpoch ?? "missing"}, current=${currentCustomerEpoch}, source: ${source}`,
			);
			await invalidateCachedFullSubjectExact({
				ctx,
				customerId,
				entityId,
				source: "partial-stale-customer-entity-epoch",
			});
			return undefined;
		}
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

	const customerEntitlements = await getStrictFeatureBalances({
		ctx,
		customerId,
		entityId,
		featureIds: meteredFeatureIdsToFetch,
	});

	if (customerEntitlements === undefined) {
		logger.warn(
			`[getCachedPartialFullSubject] Incomplete cache for ${customerId}${entityId ? `:${entityId}` : ""}, source: ${source}`,
		);
		await invalidatePartialFullSubject({
			ctx,
			customerId,
			entityId,
			source: "partial-incomplete",
		});
		return undefined;
	}

	const normalized = filterNormalizedFullSubjectByFeatureIds({
		normalized: cachedFullSubjectToNormalized({
			cached,
			customerEntitlements,
		}),
		featureIds,
	});

	return normalizedToFullSubject({ normalized });
};
