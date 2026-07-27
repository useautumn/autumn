import { AuthType, tryCatch } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { runStripeWebhookHandlers } from "../runStripeWebhookHandlers.js";
import {
	buildStripeWebhookEventKey,
	claimStripeWebhookEvent,
	completeStripeWebhookEvent,
	releaseStripeWebhookEvent,
} from "../webhookMiddlewares/stripeIdempotencyMiddleware.js";
import { syncStripeEventToSyncDb } from "../webhookMiddlewares/stripeSyncMiddleware.js";
import { attachStripeEventCustomer } from "../webhookMiddlewares/stripeToAutumnCustomerMiddleware.js";
import type { StripeWebhookContext } from "../webhookMiddlewares/stripeWebhookContext.js";

export type StripeWebhookReplayPayload = {
	orgId: string;
	env: AutumnContext["env"];
	stripeEvent: Stripe.Event;
	failedAt: number;
	failureReason: string;
};

/** Thrown when another instance holds the event lock; retryable via SQS. */
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
}: {
	ctx: AutumnContext;
	payload: StripeWebhookReplayPayload;
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
	const claim = await claimStripeWebhookEvent({ eventKey });

	if (claim === "duplicate_completed") {
		logger.info(
			`[stripeWebhookReplay] Event ${stripeEvent.id} already completed elsewhere, skipping replay`,
		);
		return;
	}

	if (claim === "in_flight") {
		throw new StripeWebhookReplayInFlightError(stripeEvent.id);
	}

	logger.info(
		`[stripeWebhookReplay] Replaying ${stripeEvent.type} (${stripeEvent.id}), originally failed at ${new Date(payload.failedAt).toISOString()}: ${payload.failureReason}`,
	);

	try {
		await runStripeWebhookHandlers({ ctx: routedCtx });
	} catch (error) {
		if (claim === "claimed") await releaseStripeWebhookEvent({ eventKey });
		throw error;
	}

	if (claim === "claimed") await completeStripeWebhookEvent({ eventKey });

	// Post-processing mirrors the route's refresh + sync middlewares (best-effort).
	if (routedCtx.fullCustomer?.id) {
		await tryCatch(
			deleteCachedFullCustomer({
				customerId: routedCtx.fullCustomer.id,
				ctx: routedCtx,
				source: `stripeWebhookReplay: ${stripeEvent.type}`,
			}),
		);
	}
	syncStripeEventToSyncDb({ ctx: routedCtx });
};
