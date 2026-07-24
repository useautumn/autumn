import type { AppEnv } from "@autumn/shared";
import { tryCatch } from "@autumn/shared";
import type { Context, Next } from "hono";
import { redis } from "@/external/redis/initRedis";
import { classifyStripeWebhookAckMode } from "./classifyStripeWebhookAckMode.js";
import type { StripeWebhookHonoEnv } from "./stripeWebhookContext.js";

const PROCESSING_TTL_MS = 5 * 60 * 1000;
const COMPLETED_TTL_MS = 24 * 60 * 60 * 1000;
const PROCESSING = "processing";
const COMPLETED = "completed";

export const buildStripeWebhookEventKey = ({
	orgId,
	env,
	eventId,
}: {
	orgId: string;
	env: AppEnv;
	eventId: string;
}) => `stripe:webhook:${orgId}:${env}:${eventId}`;

export type StripeWebhookClaimResult =
	| "claimed"
	| "duplicate_completed"
	| "in_flight"
	| "unavailable";

/** Atomically claims an event for processing. "unavailable" = Redis down (fail open). */
export const claimStripeWebhookEvent = async ({
	eventKey,
}: {
	eventKey: string;
}): Promise<StripeWebhookClaimResult> => {
	if (redis.status !== "ready") return "unavailable";

	const { data: result, error } = await tryCatch(
		redis.set(eventKey, PROCESSING, "PX", PROCESSING_TTL_MS, "NX"),
	);
	if (error) return "unavailable";
	if (result !== null) return "claimed";

	const { data: existing } = await tryCatch(redis.get(eventKey));
	return existing === COMPLETED ? "duplicate_completed" : "in_flight";
};

export const completeStripeWebhookEvent = async ({
	eventKey,
}: {
	eventKey: string;
}) => {
	await tryCatch(redis.set(eventKey, COMPLETED, "PX", COMPLETED_TTL_MS));
};

export const releaseStripeWebhookEvent = async ({
	eventKey,
}: {
	eventKey: string;
}) => {
	await tryCatch(redis.del(eventKey));
};

/**
 * Two-state webhook idempotency: a processing lock is taken before handling,
 * but the event only counts as a duplicate once marked COMPLETED (via the
 * ctx.webhookIdempotency hooks). A failed run deletes the lock so Stripe's
 * retry of the same event id reprocesses instead of being dropped.
 *
 * If Redis is unavailable or errors, the request is allowed through (fail-open).
 */
export const stripeIdempotencyMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx");
	const { stripeEvent, org, env } = ctx;

	ctx.webhookAckMode = classifyStripeWebhookAckMode({ event: stripeEvent });

	const eventKey = buildStripeWebhookEventKey({
		orgId: org.id,
		env,
		eventId: stripeEvent.id,
	});

	const claim = await claimStripeWebhookEvent({ eventKey });

	if (claim === "unavailable") {
		// Redis down or errored - fail open
		ctx.logger.warn(
			`[stripeIdempotencyMiddleware] Redis unavailable, allowing through: ${stripeEvent.id}`,
		);
		await next();
		return;
	}

	if (
		claim === "duplicate_completed" ||
		(claim === "in_flight" && ctx.webhookAckMode === "early")
	) {
		ctx.logger.info(
			`[stripeIdempotencyMiddleware] Duplicate webhook event detected, skipping: ${stripeEvent.id}`,
		);
		return c.json({ received: true, duplicate: true }, 200);
	}

	if (claim === "in_flight") {
		// Sync event still in flight — 500 keeps Stripe retrying until completed.
		ctx.logger.info(
			`[stripeIdempotencyMiddleware] Sync webhook event in flight, asking Stripe to retry: ${stripeEvent.id}`,
		);
		return c.json({ received: false, in_flight: true }, 500);
	}

	ctx.webhookIdempotency = {
		markCompleted: () => completeStripeWebhookEvent({ eventKey }),
		release: () => releaseStripeWebhookEvent({ eventKey }),
	};

	await next();
};
