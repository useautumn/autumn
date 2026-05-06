import type { Redis } from "ioredis";
import { getRedisTargetsForCustomer } from "@/external/redis/customerRedisRouting.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";

const invalidateCachedFullSubjectExactOnRedis = async ({
	customerId,
	entityId,
	ctx,
	source,
	redisV2,
}: {
	customerId: string;
	entityId?: string;
	ctx: AutumnContext;
	source?: string;
	redisV2: Redis;
}): Promise<void> => {
	if (redisV2.status !== "ready") return;

	const { org, env, logger } = ctx;

	const subjectKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});
	const subjectLabel = entityId ? `${customerId}:${entityId}` : customerId;

	const result = await tryRedisOp({
		operation: () => redisV2.unlink(subjectKey),
		source: "invalidateCachedFullSubjectExact",
		redisInstance: redisV2,
		onError: (error: unknown) => {
			logger.error(
				`[invalidateCachedFullSubjectExact] subject: ${subjectLabel}, source: ${source}, error: ${error}`,
			);
		},
	});

	if (result !== undefined) {
		logger.info(
			`[invalidateCachedFullSubjectExact] subject: ${subjectLabel}, source: ${source}`,
		);
	}
};

export const invalidateCachedFullSubjectExact = async ({
	customerId,
	entityId,
	ctx,
	source,
}: {
	customerId: string;
	entityId?: string;
	ctx: AutumnContext;
	source?: string;
}): Promise<void> => {
	if (!customerId) return;

	await Promise.all(
		getRedisTargetsForCustomer({
			org: ctx.org,
			currentRedis: ctx.redisV2,
		}).map((redisV2) =>
			invalidateCachedFullSubjectExactOnRedis({
				customerId,
				entityId,
				ctx,
				source,
				redisV2,
			}),
		),
	);
};
