import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { workflows } from "@/queue/workflows.js";
import { tryRedisNx, tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

const AUTO_TOPUP_PENDING_TTL_SECONDS = 30;

export const buildAutoTopupPendingKey = ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
}) => {
	const { org, env } = ctx;
	return `auto_topup:pending:${org.id}:${env}:${customerId}:${featureId}`;
};

export const clearAutoTopupPendingKey = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
}) => {
	const pendingKey = buildAutoTopupPendingKey({ ctx, customerId, featureId });
	await tryRedisWrite(() => redis.del(pendingKey));
};

export const enqueueAutoTopupWithBurstSuppression = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
}) => {
	const { org, env } = ctx;
	const pendingKey = buildAutoTopupPendingKey({ ctx, customerId, featureId });

	return await tryRedisNx({
		operation: () =>
			redis.set(pendingKey, "1", "EX", AUTO_TOPUP_PENDING_TTL_SECONDS, "NX"),

		onSuccess: async () => {
			await workflows.triggerAutoTopUp({
				orgId: org.id,
				env,
				customerId,
				featureId,
			});

			ctx.logger.info(
				`[enqueueAutoTopupWithBurstSuppression] Auto top-up job enqueued for customer ${customerId} and feature ${featureId}`,
			);

			return { enqueued: true, reason: "enqueued" as const };
		},

		onRedisUnavailable: () => {
			ctx.logger.warn(
				`[enqueueAutoTopupWithBurstSuppression] Redis unavailable, skipping auto top-up for customer ${customerId} and feature ${featureId}`,
			);
			return { enqueued: false, reason: "redis_unavailable" as const };
		},

		onKeyAlreadyExists: () => {
			ctx.logger.warn(
				`[enqueueAutoTopupWithBurstSuppression] Skipping auto top-up job for customer ${customerId} and feature ${featureId} because pending key already exists`,
			);
			return { enqueued: false, reason: "pending_key_exists" as const };
		},
	});
};
