import { type FullSubject, normalizedToFullSubject } from "@autumn/shared";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { lazyResetSubjectEntitlements } from "@/internal/customers/actions/resetCustomerEntitlementsV2/lazyResetSubjectEntitlements.js";
import { getFullSubjectRolloutSnapshot } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { isSnapshotCacheStale } from "@/internal/misc/rollouts/rolloutUtils.js";
import { applyLiveAggregatedBalances } from "../balances/applyLiveAggregatedBalances.js";
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

export type GetCachedFullSubjectResult = {
	fullSubject: FullSubject | undefined;
	subjectViewEpoch: number;
};

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
		logger.warn(
			`[getCachedFullSubject] Stale subject view epoch for ${customerId}${entityId ? `:${entityId}` : ""}, cached=${cached.subjectViewEpoch}, current=${currentSubjectViewEpoch}, source: ${source}`,
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

	const isCustomerSubject = !entityId;
	const balancesOutcome = await getCachedFeatureBalancesBatch({
		ctx,
		customerId,
		featureIds: cached.meteredFeatures,
		customerEntitlementIdsByFeatureId: cached.customerEntitlementIdsByFeatureId,
		includeAggregated: isCustomerSubject,
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

		const fullSubject = normalizedToFullSubject({ normalized });
		await lazyResetSubjectEntitlements({ ctx, fullSubject });
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
