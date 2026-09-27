import { tryRedisOp } from "../ops/runRedisOp.js";
import { tryRedisNx } from "../ops/tryRedisNx.js";
import type {
	AutoTopUpPendingClaim,
	AutoTopUpPendingKeyParams,
	AutoTopUpSuppressionContext,
} from "./types/autoTopUpSuppression.js";

/** The pending key gates duplicate enqueues of one customer+feature; the webhook key dedupes failure webhooks. */
export const AUTO_TOPUP_PENDING_TTL_SECONDS = 30;

export const buildAutoTopupPendingKey = ({
	orgId,
	env,
	customerId,
	featureId,
}: AutoTopUpPendingKeyParams): string =>
	`auto_topup:pending:${orgId}:${env}:${customerId}:${featureId}`;

export const claimAutoTopupPendingKey = async ({
	ctx,
	...key
}: {
	ctx: AutoTopUpSuppressionContext;
} & AutoTopUpPendingKeyParams): Promise<AutoTopUpPendingClaim> => {
	const pendingKey = buildAutoTopupPendingKey(key);
	const redis = ctx.miscCache.getActive();
	return tryRedisNx({
		operation: () =>
			redis.set(pendingKey, "1", "EX", AUTO_TOPUP_PENDING_TTL_SECONDS, "NX"),
		source: "auto-topup-suppression:claim-pending",
		redisInstance: redis,
		onSuccess: () => "claimed" as const,
		onKeyAlreadyExists: () => "pending_exists" as const,
		onRedisUnavailable: () => "unavailable" as const,
	});
};

export const clearAutoTopupPendingKey = async ({
	ctx,
	...key
}: {
	ctx: AutoTopUpSuppressionContext;
} & AutoTopUpPendingKeyParams): Promise<void> => {
	const pendingKey = buildAutoTopupPendingKey(key);
	const redis = ctx.miscCache.getActive();
	await tryRedisOp({
		operation: () => redis.del(pendingKey),
		source: "auto-topup-suppression:clear-pending",
		redisInstance: redis,
		onError: (error) =>
			ctx.logger.warn("[autoTopUpSuppression] clear-pending failed", {
				data: { customerId: key.customerId, featureId: key.featureId },
				error,
			}),
	});
};

/** Holds the gate closed past the job, so a retry storm cannot re-enqueue before the cause clears. */
export const keepAutoTopupPendingKey = async ({
	ctx,
	ttlMs,
	...key
}: {
	ctx: AutoTopUpSuppressionContext;
	ttlMs: number;
} & AutoTopUpPendingKeyParams): Promise<void> => {
	const pendingKey = buildAutoTopupPendingKey(key);
	const redis = ctx.miscCache.getActive();
	await tryRedisOp({
		operation: () => redis.set(pendingKey, "1", "PX", ttlMs),
		source: "auto-topup-suppression:keep-pending",
		redisInstance: redis,
		onError: (error) =>
			ctx.logger.warn("[autoTopUpSuppression] keep-pending failed", {
				data: { customerId: key.customerId, featureId: key.featureId },
				error,
			}),
	});
};

/** True = emit the webhook: the key was claimed, or Redis is down and we fail open. */
export const claimAutoTopupWebhookSuppression = async ({
	ctx,
	suppressionKey,
	suppressionTtlMs,
}: {
	ctx: AutoTopUpSuppressionContext;
	suppressionKey: string;
	suppressionTtlMs: number;
}): Promise<boolean> => {
	const ttlSeconds = Math.max(1, Math.ceil(suppressionTtlMs / 1000));
	const redis = ctx.miscCache.getActive();
	return tryRedisNx({
		operation: () => redis.set(suppressionKey, "1", "EX", ttlSeconds, "NX"),
		source: "auto-topup-suppression:claim-webhook",
		redisInstance: redis,
		onSuccess: () => true,
		onKeyAlreadyExists: () => {
			ctx.logger.info("[autoTopUpSuppression] duplicate webhook suppressed", {
				data: { suppressionKey },
			});
			return false;
		},
		onRedisUnavailable: () => {
			ctx.logger.warn("[autoTopUpSuppression] claim-webhook failed", {
				data: { suppressionKey },
			});
			return true;
		},
	});
};

export const releaseAutoTopupWebhookSuppression = async ({
	ctx,
	suppressionKey,
}: {
	ctx: AutoTopUpSuppressionContext;
	suppressionKey: string;
}): Promise<void> => {
	const redis = ctx.miscCache.getActive();
	await tryRedisOp({
		operation: () => redis.del(suppressionKey),
		source: "auto-topup-suppression:release-webhook",
		redisInstance: redis,
		onError: (error) =>
			ctx.logger.warn("[autoTopUpSuppression] release-webhook failed", {
				data: { suppressionKey },
				error,
			}),
	});
};
