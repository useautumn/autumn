import { AuthType, tryCatch } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { runStripeWebhookHandlers } from "../runStripeWebhookHandlers.js";
import { isStripeWebhookLockRequired } from "../webhookMiddlewares/classifyStripeWebhookAckMode.js";
import {
	buildStripeWebhookEventKey,
	claimStripeWebhookEvent,
	completeStripeWebhookEvent,
	newStripeWebhookLockToken,
	releaseStripeWebhookEvent,
	startStripeWebhookLockRenewal,
} from "../webhookMiddlewares/stripeIdempotencyMiddleware.js";
import { syncStripeEventToSyncDb } from "../webhookMiddlewares/stripeSyncMiddleware.js";
import { attachStripeEventCustomer } from "../webhookMiddlewares/stripeToAutumnCustomerMiddleware.js";
import type { StripeWebhookContext } from "../webhookMiddlewares/stripeWebhookContext.js";
import { STRIPE_WEBHOOK_REPLAY_MAX_ATTEMPTS } from "./stripeWebhookErrorWouldRedeliver.js";

export type StripeWebhookReplayPayload = {
	orgId: string;
	env: AutumnContext["env"];
	stripeEvent: Stripe.Event;
	failedAt: number;
	failureReason: string;
};

/** Thrown when the event lock is held elsewhere or unavailable but required; retryable via SQS. */
export class StripeWebhookReplayInFlightError extends Error {
	constructor(eventId: string) {
		super(`Stripe webhook replay in flight for event ${eventId}`);
		this.name = "StripeWebhookReplayInFlightError";
	}
}

/**
 * Worker entry: replays a failed early-acked Stripe webhook through the same
 * pipeline the route runs (customer resolution -> handlers -> cache refresh
 * -> sync mirror), guarded by the same Redis idempotency claim.
 */
export const runStripeWebhookReplay = async ({
	ctx,
	payload,
	receiveCount = 1,
}: {
	ctx: AutumnContext;
	payload: StripeWebhookReplayPayload;
	receiveCount?: number;
}) => {
	const { stripeEvent } = payload;
	const { logger } = ctx;

	const webhookCtx: StripeWebhookContext = {
		...ctx,
		authType: AuthType.Stripe,
		stripeEvent,
		stripeCli: createStripeCli({ org: ctx.org, env: ctx.env }),
	};

	const routedCtx = await attachStripeEventCustomer({ ctx: webhookCtx });

	const eventKey = buildStripeWebhookEventKey({
		orgId: ctx.org.id,
		env: ctx.env,
		eventId: stripeEvent.id,
	});
	const token = newStripeWebhookLockToken();
	const lockRequired = isStripeWebhookLockRequired({ event: stripeEvent });
	const claim = await claimStripeWebhookEvent({ eventKey, token });

	if (claim === "duplicate_completed") {
		logger.info(
			`[stripeWebhookReplay] Event ${stripeEvent.id} already completed elsewhere, skipping replay`,
		);
		return;
	}

	if (claim === "in_flight" || (claim === "unavailable" && lockRequired)) {
		if (receiveCount >= STRIPE_WEBHOOK_REPLAY_MAX_ATTEMPTS) return;
		throw new StripeWebhookReplayInFlightError(stripeEvent.id);
	}

	logger.info(
		`[stripeWebhookReplay] Replaying ${stripeEvent.type} (${stripeEvent.id}), originally failed at ${new Date(payload.failedAt).toISOString()}: ${payload.failureReason}`,
	);

	const stopRenewal =
		claim === "claimed" && lockRequired
			? startStripeWebhookLockRenewal({ eventKey, token })
			: undefined;
	try {
		await runStripeWebhookHandlers({ ctx: routedCtx });
	} catch (error) {
		if (claim === "claimed") {
			await releaseStripeWebhookEvent({ eventKey, token });
		}
		if (receiveCount >= STRIPE_WEBHOOK_REPLAY_MAX_ATTEMPTS) return;
		throw error;
	} finally {
		stopRenewal?.();
	}

	if (claim === "claimed") {
		await completeStripeWebhookEvent({ eventKey, token });
	}

	// Post-processing mirrors the route's refresh + sync middlewares (best-effort).
	if (routedCtx.fullCustomer?.id && !routedCtx.skipSubjectCacheDeletion) {
		await tryCatch(
			deleteCachedFullCustomer({
				customerId: routedCtx.fullCustomer.id,
				ctx: routedCtx,
				source: `stripeWebhookReplay: ${stripeEvent.type}`,
				flushBalances: true,
			}),
		);
	}
	syncStripeEventToSyncDb({ ctx: routedCtx });
};
