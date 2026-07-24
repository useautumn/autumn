import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import type { Context, Next } from "hono";
import { enqueueStripeWebhookReplay } from "../webhookReplay/enqueueStripeWebhookReplay.js";
import { classifyStripeWebhookAckMode } from "./classifyStripeWebhookAckMode.js";
import type { StripeWebhookHonoEnv } from "./stripeWebhookContext.js";

const tracer = trace.getTracer("autumn-stripe-webhook");

const getWaitUntil = (c: Context<StripeWebhookHonoEnv>) => {
	try {
		return c.executionCtx.waitUntil.bind(c.executionCtx);
	} catch {
		return undefined;
	}
};

/**
 * Ack policy: "early" events are acked 200 before processing (Stripe blocks
 * its own API calls on webhook delivery, so Autumn-triggered events must not
 * wait). "sync" events are acked only after processing succeeds — a failure
 * releases the idempotency lock and 500s so Stripe redelivers.
 */
export const stripeWebhookAckMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx");
	const ackMode =
		ctx.webhookAckMode ??
		classifyStripeWebhookAckMode({ event: ctx.stripeEvent });
	const idempotency = ctx.webhookIdempotency;

	if (ackMode === "sync") {
		try {
			await next();
		} catch (error) {
			ctx.logger.error(`Stripe webhook sync processing failed: ${error}`, {
				error,
			});
			await idempotency?.release();
			return c.json(
				{ message: "Webhook processing failed, Stripe will retry" },
				500,
			);
		}

		// A throwing handler resolves next() with c.error set (app onError owns
		// the response), so failure must be detected here, not via catch.
		if (c.error) {
			await idempotency?.release();
			return;
		}

		await idempotency?.markCompleted();
		return;
	}

	// Start a span that survives past the early-ack response. Parented to the
	// still-active root HTTP span; ended in finally(...) when deferred work
	// completes so traceEnrichMiddleware + child spans land on a live span.
	const deferredSpan = tracer.startSpan("stripe.webhook.deferred");
	const ctxWithSpan = trace.setSpan(context.active(), deferredSpan);

	const runWebhook = () =>
		context.with(ctxWithSpan, () =>
			Promise.resolve()
				.then(next)
				.then(() => {
					if (c.error) throw c.error;
					return idempotency?.markCompleted();
				})
				.catch(async (error) => {
					deferredSpan.recordException(error);
					deferredSpan.setStatus({ code: SpanStatusCode.ERROR });
					await idempotency?.release();

					const queued = await enqueueStripeWebhookReplay({
						ctx,
						failureReason:
							error instanceof Error ? error.message : String(error),
					});
					ctx.logger.error(
						`[stripeWebhookAck] Early-acked Stripe webhook FAILED after 200 (${ctx.stripeEvent?.type}), ${queued ? "queued for replay" : "NOT queued for replay"}`,
						{
							error,
							data: {
								eventId: ctx.stripeEvent?.id,
								eventType: ctx.stripeEvent?.type,
								queuedForReplay: queued,
							},
						},
					);
				})
				.finally(() => deferredSpan.end()),
		);

	const waitUntil = getWaitUntil(c);
	if (waitUntil) {
		let webhookRun: Promise<unknown> | undefined;
		try {
			webhookRun = runWebhook();
			waitUntil(webhookRun);
		} catch (error) {
			ctx.logger.error(`Stripe webhook waitUntil failed: ${error}`, { error });
			// The chain settles the claim + span itself once started; only a
			// failure BEFORE start needs rescheduling so the event isn't lost.
			if (!webhookRun) setImmediate(() => void runWebhook());
		}
	} else {
		setImmediate(() => void runWebhook());
	}

	return c.json({ received: true }, 200);
};
