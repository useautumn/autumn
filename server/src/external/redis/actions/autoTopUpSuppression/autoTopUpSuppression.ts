import {
	type AutoTopUpSuppressionContext,
	claimAutoTopupPendingKey as claimPendingKey,
	claimAutoTopupWebhookSuppression as claimWebhookSuppression,
	clearAutoTopupPendingKey as clearPendingKey,
	keepAutoTopupPendingKey as keepPendingKey,
	releaseAutoTopupWebhookSuppression as releaseWebhookSuppression,
} from "@autumn/cache";
import { getMiscCache } from "@/external/redis/miscCache/getMiscCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export {
	AUTO_TOPUP_PENDING_TTL_SECONDS,
	type AutoTopUpPendingClaim as AutoTopupPendingClaim,
} from "@autumn/cache";

/** The server's binding of the shared action: the request's org, env, and logger over the misc cache. */
const suppressionContext = ({
	ctx,
}: {
	ctx: AutumnContext;
}): { ctx: AutoTopUpSuppressionContext; orgId: string; env: string } => ({
	ctx: { miscCache: getMiscCache(), logger: ctx.logger },
	orgId: ctx.org.id,
	env: ctx.env,
});

type PendingKeyParams = {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
};

export const claimAutoTopupPendingKey = ({ ctx, ...key }: PendingKeyParams) =>
	claimPendingKey({ ...suppressionContext({ ctx }), ...key });

export const clearAutoTopupPendingKey = ({ ctx, ...key }: PendingKeyParams) =>
	clearPendingKey({ ...suppressionContext({ ctx }), ...key });

export const keepAutoTopupPendingKey = ({
	ctx,
	ttlMs,
	...key
}: PendingKeyParams & { ttlMs: number }) =>
	keepPendingKey({ ...suppressionContext({ ctx }), ...key, ttlMs });

export const claimAutoTopupWebhookSuppression = ({
	ctx,
	suppressionKey,
	suppressionTtlMs,
}: {
	ctx: AutumnContext;
	suppressionKey: string;
	suppressionTtlMs: number;
}) =>
	claimWebhookSuppression({
		ctx: suppressionContext({ ctx }).ctx,
		suppressionKey,
		suppressionTtlMs,
	});

export const releaseAutoTopupWebhookSuppression = ({
	ctx,
	suppressionKey,
}: {
	ctx: AutumnContext;
	suppressionKey: string;
}) =>
	releaseWebhookSuppression({
		ctx: suppressionContext({ ctx }).ctx,
		suppressionKey,
	});
