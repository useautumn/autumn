import { tryCatch } from "@autumn/shared";
import type { Context, Next } from "hono";
import { redis } from "@/external/redis/initRedis";
import type { StripeWebhookHonoEnv } from "./stripeWebhookContext";

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Middleware that prevents duplicate processing of Stripe webhook events.
 * Uses Redis SET NX PX to atomically check and set event ID with expiry,
 * ensuring only one instance processes each event even with concurrent deliveries.
 *
 * If Redis is unavailable or errors, the middleware allows the request through (fail-open).
 */
export const stripeIdempotencyMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx");
	const { stripeEvent, org, env } = ctx;

	const idempotencyKey = `stripe:webhook:${org.id}:${env}:${stripeEvent.id}`;

	// Fail open if Redis not ready
	if (redis.status !== "ready") {
		await next();
		return;
	}

	// Atomically try to set the key with expiry
	// NX = only set if key doesn't exist, PX = set expiry in milliseconds
	// Returns "OK" if set, null if key already exists
	const { data: result, error } = await tryCatch(
		redis.set(
			idempotencyKey,
			Date.now().toString(),
			"PX",
			IDEMPOTENCY_TTL_MS,
			"NX",
		),
	);

	if (error) {
		// Redis error - fail open
		ctx.logger.warn(
			`[stripeIdempotencyMiddleware] Redis error, allowing through: ${error}`,
		);
		await next();
		return;
	}

	if (result === null) {
		// Key already exists - duplicate event
		ctx.logger.info(
			`[stripeIdempotencyMiddleware] Duplicate webhook event detected, skipping: ${stripeEvent.id}`,
		);
		return c.json({ received: true, duplicate: true }, 200);
	}

	// Lock acquired ("OK"), proceed with processing
	await next();
};
