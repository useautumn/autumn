import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { tryRedisNx } from "@/external/redis/utils/tryRedisNx.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Pinned cross-request suppression state: the pending key gates duplicate
 *  auto-top-up enqueues; the webhook key dedupes failure webhooks. */
export const AUTO_TOPUP_PENDING_TTL_SECONDS = 30;

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

export type AutoTopupPendingClaim =
	| "claimed"
	| "pending_exists"
	| "unavailable";

export const claimAutoTopupPendingKey = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
}): Promise<AutoTopupPendingClaim> => {
	const pendingKey = buildAutoTopupPendingKey({ ctx, customerId, featureId });

	return tryRedisNx({
		operation: () =>
			getMiscRedis().set(
				pendingKey,
				"1",
				"EX",
				AUTO_TOPUP_PENDING_TTL_SECONDS,
				"NX",
			),
		source: "auto-topup-suppression:claim-pending",
		redisInstance: getMiscRedis(),
		onSuccess: () => "claimed" as const,
		onKeyAlreadyExists: () => "pending_exists" as const,
		onRedisUnavailable: () => "unavailable" as const,
	});
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

	await tryRedisOp({
		operation: () => getMiscRedis().del(pendingKey),
		source: "auto-topup-suppression:clear-pending",
		redisInstance: getMiscRedis(),
		onError: (error) =>
			ctx.logger.warn("[autoTopUpSuppression] clear-pending failed", {
				data: { customerId, featureId },
				error,
			}),
	});
};

export const keepAutoTopupPendingKey = async ({
	ctx,
	customerId,
	featureId,
	ttlMs,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
	ttlMs: number;
}) => {
	const pendingKey = buildAutoTopupPendingKey({ ctx, customerId, featureId });

	await tryRedisOp({
		operation: () => getMiscRedis().set(pendingKey, "1", "PX", ttlMs),
		source: "auto-topup-suppression:keep-pending",
		redisInstance: getMiscRedis(),
		onError: (error) =>
			ctx.logger.warn("[autoTopUpSuppression] keep-pending failed", {
				data: { customerId, featureId },
				error,
			}),
	});
};

/** True = emit the webhook (claimed the key, or fail-open on Redis trouble). */
export const claimAutoTopupWebhookSuppression = async ({
	ctx,
	suppressionKey,
	suppressionTtlMs,
}: {
	ctx: AutumnContext;
	suppressionKey: string;
	suppressionTtlMs: number;
}): Promise<boolean> => {
	const ttlSeconds = Math.max(1, Math.ceil(suppressionTtlMs / 1000));

	return tryRedisNx({
		operation: () =>
			getMiscRedis().set(suppressionKey, "1", "EX", ttlSeconds, "NX"),
		source: "auto-topup-suppression:claim-webhook",
		redisInstance: getMiscRedis(),
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
	ctx: AutumnContext;
	suppressionKey: string;
}): Promise<void> => {
	await tryRedisOp({
		operation: () => getMiscRedis().del(suppressionKey),
		source: "auto-topup-suppression:release-webhook",
		redisInstance: getMiscRedis(),
		onError: (error) =>
			ctx.logger.warn("[autoTopUpSuppression] release-webhook failed", {
				data: { suppressionKey },
				error,
			}),
	});
};
