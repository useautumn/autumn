import type { Redis } from "ioredis";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getRedisTargetsForCustomer } from "@/external/redis/customerRedisRouting.js";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "../../builders/buildFullSubjectViewEpochKey.js";
import { FULL_SUBJECT_EPOCH_TTL_SECONDS } from "../../config/fullSubjectCacheConfig.js";
import {
	invalidateSharedBalanceFields,
	type SharedBalanceCaptureMode,
} from "./invalidateSharedBalanceFields.js";

const invalidateCachedFullSubjectOnRedis = async ({
	customerId,
	entityId,
	ctx,
	source,
	redisV2,
	flushBalances,
	balanceSyncDb,
	balanceCaptureMode,
}: {
	customerId: string;
	entityId?: string;
	ctx: AutumnContext;
	source?: string;
	redisV2: Redis;
	flushBalances?: boolean;
	balanceSyncDb?: DrizzleCli;
	balanceCaptureMode?: SharedBalanceCaptureMode;
}): Promise<void> => {
	if (redisV2.status !== "ready") {
		if (balanceCaptureMode === "strict") {
			throw new RedisUnavailableError({
				source: "invalidateCachedFullSubject:not-ready",
				reason: "not_ready",
			});
		}
		const subjectLabel = entityId ? `${customerId}:${entityId}` : customerId;
		ctx.logger.warn(
			`[invalidateCachedFullSubject] redisV2 not_ready (status=${redisV2.status}), skipping subject: ${subjectLabel}, source: ${source}`,
		);
		return;
	}

	await invalidateSharedBalanceFields({
		ctx,
		customerId,
		redisV2,
		flushBalances,
		balanceSyncDb,
		balanceCaptureMode,
	});

	const { org, env, logger } = ctx;

	const customerSubjectKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
	});

	const entitySubjectKey = entityId
		? buildFullSubjectKey({ orgId: org.id, env, customerId, entityId })
		: undefined;

	const epochKey = buildFullSubjectViewEpochKey({
		orgId: org.id,
		env,
		customerId,
	});

	const pipeline = redisV2.pipeline().unlink(customerSubjectKey);
	if (entitySubjectKey) pipeline.unlink(entitySubjectKey);
	pipeline.incr(epochKey).expire(epochKey, FULL_SUBJECT_EPOCH_TTL_SECONDS);

	const subjectLabel = entityId ? `${customerId}:${entityId}` : customerId;
	const result = await tryRedisOp({
		operation: () => pipeline.exec(),
		source: "invalidateCachedFullSubject",
		redisInstance: redisV2,
		onError: (error: unknown) => {
			logger.error(
				`[invalidateCachedFullSubject] subject: ${subjectLabel}, source: ${source}, error: ${error}`,
			);
		},
	});

	if (result !== undefined) {
		logger.info(
			`[invalidateCachedFullSubject] subject: ${subjectLabel}, source: ${source}`,
		);
	}
};

export const invalidateCachedFullSubject = async ({
	customerId,
	entityId,
	ctx,
	source,
	flushBalances,
	balanceSyncDb,
	balanceCaptureMode = "best_effort",
}: {
	customerId: string;
	entityId?: string;
	ctx: AutumnContext;
	source?: string;
	/** Flush cached balances to Postgres before deleting them. Only safe when
	 *  the caller has NOT just written balances to Postgres directly — the
	 *  cached balances must still be the source of truth. */
	flushBalances?: boolean;
	balanceSyncDb?: DrizzleCli;
	/** Fail closed when authoritative shared-balance capture is required before
	 * a Postgres mutation. Secondary cache targets remain best-effort. */
	balanceCaptureMode?: SharedBalanceCaptureMode;
}): Promise<void> => {
	if (!customerId) return;

	await Promise.all(
		getRedisTargetsForCustomer({
			org: ctx.org,
			currentRedis: ctx.redisV2,
		}).map((redisV2) =>
			invalidateCachedFullSubjectOnRedis({
				customerId,
				entityId,
				ctx,
				source,
				redisV2,
				// Only the authoritative cache may write a captured snapshot back
				// to Postgres. Migration/secondary caches are deletion-only.
				flushBalances: flushBalances && redisV2 === ctx.redisV2,
				balanceSyncDb: redisV2 === ctx.redisV2 ? balanceSyncDb : undefined,
				balanceCaptureMode:
					redisV2 === ctx.redisV2 ? balanceCaptureMode : "best_effort",
			}),
		),
	);
};
