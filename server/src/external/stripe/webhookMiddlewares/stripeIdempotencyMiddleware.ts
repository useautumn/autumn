import { randomUUID } from "node:crypto";
import type { AppEnv } from "@autumn/shared";
import { tryCatch } from "@autumn/shared";
import type { Context, Next } from "hono";
import { getMiscRedis } from "@/external/redis/initRedis";
import {
	classifyStripeWebhookAckMode,
	isStripeWebhookLockRequired,
} from "./classifyStripeWebhookAckMode.js";
import type { StripeWebhookHonoEnv } from "./stripeWebhookContext.js";

const PROCESSING_TTL_MS = 5 * 60 * 1000;
const COMPLETED_TTL_MS = 24 * 60 * 60 * 1000;
const RENEWAL_INTERVAL_MS = PROCESSING_TTL_MS / 3;

const processingValue = (token?: string) =>
	token ? `${PROCESSING}:${token}` : PROCESSING;

// Only the claim owner may touch the key; an expired-and-reclaimed lock is left alone.
const RELEASE_IF_OWNED = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0`;
const RENEW_IF_OWNED = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) end return 0`;
const COMPLETE_IF_OWNED_OR_FREE = `local v = redis.call('get', KEYS[1]) if v == false or v == ARGV[1] then return redis.call('set', KEYS[1], ARGV[2], 'PX', ARGV[3]) end return 0`;

export const newStripeWebhookLockToken = () => randomUUID();
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
	token,
}: {
	eventKey: string;
	token?: string;
}): Promise<StripeWebhookClaimResult> => {
	const miscRedis = getMiscRedis();
	if (miscRedis.status !== "ready") return "unavailable";

	const { data: result, error } = await tryCatch(
		miscRedis.set(
			eventKey,
			processingValue(token),
			"PX",
			PROCESSING_TTL_MS,
			"NX",
		),
	);
	if (error) return "unavailable";
	if (result !== null) return "claimed";

	const { data: existing } = await tryCatch(miscRedis.get(eventKey));
	return existing === COMPLETED ? "duplicate_completed" : "in_flight";
};

export const completeStripeWebhookEvent = async ({
	eventKey,
	token,
}: {
	eventKey: string;
	token?: string;
}) => {
	if (!token) {
		await tryCatch(
			getMiscRedis().set(eventKey, COMPLETED, "PX", COMPLETED_TTL_MS),
		);
		return;
	}
	await tryCatch(
		getMiscRedis().eval(
			COMPLETE_IF_OWNED_OR_FREE,
			1,
			eventKey,
			processingValue(token),
			COMPLETED,
			COMPLETED_TTL_MS,
		),
	);
};

/** Keeps an owned processing lock alive while a long handler runs. */
export const startStripeWebhookLockRenewal = ({
	eventKey,
	token,
}: {
	eventKey: string;
	token: string;
}): (() => void) => {
	const timer = setInterval(() => {
		void tryCatch(
			getMiscRedis().eval(
				RENEW_IF_OWNED,
				1,
				eventKey,
				processingValue(token),
				PROCESSING_TTL_MS,
			),
		);
	}, RENEWAL_INTERVAL_MS);
	timer.unref?.();
	return () => clearInterval(timer);
};

export const releaseStripeWebhookEvent = async ({
	eventKey,
	token,
}: {
	eventKey: string;
	token?: string;
}) => {
	if (!token) {
		await tryCatch(getMiscRedis().del(eventKey));
		return;
	}
	await tryCatch(
		getMiscRedis().eval(RELEASE_IF_OWNED, 1, eventKey, processingValue(token)),
	);
};

/**
 * Two-state webhook idempotency: a processing lock is taken before handling,
 * but the event only counts as a duplicate once marked COMPLETED (via the
 * ctx.webhookIdempotency hooks). A failed run deletes the lock so Stripe's
 * retry of the same event id reprocesses instead of being dropped.
 *
 * If Redis is unavailable or errors, the request is allowed through (fail-open),
 * except for events that must never run twice concurrently (see
 * isStripeWebhookLockRequired), which are 500ed so Stripe retries later.
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

	const token = newStripeWebhookLockToken();
	const lockRequired = isStripeWebhookLockRequired({ event: stripeEvent });
	const claim = await claimStripeWebhookEvent({ eventKey, token });

	if (claim === "unavailable") {
		if (lockRequired) {
			ctx.logger.error(
				`[stripeIdempotencyMiddleware] Redis unavailable and event requires the lock, asking Stripe to retry: ${stripeEvent.id}`,
			);
			return c.json({ received: false, lock_unavailable: true }, 500);
		}
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
		markCompleted: () => completeStripeWebhookEvent({ eventKey, token }),
		release: () => releaseStripeWebhookEvent({ eventKey, token }),
	};

	const stopRenewal = lockRequired
		? startStripeWebhookLockRenewal({ eventKey, token })
		: undefined;
	try {
		await next();
	} finally {
		stopRenewal?.();
	}
};
