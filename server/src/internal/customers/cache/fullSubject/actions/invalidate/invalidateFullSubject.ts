import type { Redis } from "ioredis";
import { getRedisTargetsForCustomer } from "@/external/redis/customerRedisRouting.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildFullSubjectViewEpochKey } from "../../builders/buildFullSubjectViewEpochKey.js";
import { FULL_SUBJECT_EPOCH_TTL_SECONDS } from "../../config/fullSubjectCacheConfig.js";
import { invalidateSharedBalanceFields } from "./invalidateSharedBalanceFields.js";

const invalidateCachedFullSubjectOnRedis = async ({
	customerId,
	entityId,
	ctx,
	source,
	redisV2,
	flushBalances,
}: {
	customerId: string;
	entityId?: string;
	ctx: AutumnContext;
	source?: string;
	redisV2: Redis;
	flushBalances?: boolean;
}): Promise<void> => {
	if (redisV2.status !== "ready") {
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
}: {
	customerId: string;
	entityId?: string;
	ctx: AutumnContext;
	source?: string;
	/** Flush cached balances to Postgres before deleting them. Only safe when
	 *  the caller has NOT just written balances to Postgres directly — the
	 *  cached balances must still be the source of truth. */
	flushBalances?: boolean;
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
				flushBalances,
			}),
		),
	);
};
