import { SpanStatusCode, context, trace } from "@opentelemetry/api";
import type { Context, Next } from "hono";
import type { StripeWebhookHonoEnv } from "./stripeWebhookContext";

const tracer = trace.getTracer("autumn-stripe-webhook");

const getWaitUntil = (c: Context<StripeWebhookHonoEnv>) => {
	try {
		return c.executionCtx.waitUntil.bind(c.executionCtx);
	} catch {
		return undefined;
	}
};

export const stripeWebhookEarlyAckMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx");

	// Start a span that survives past the early-ack response. Parented to the
	// still-active root HTTP span; ended in finally(...) when deferred work
	// completes so traceEnrichMiddleware + child spans land on a live span.
	const deferredSpan = tracer.startSpan("stripe.webhook.deferred");
	const ctxWithSpan = trace.setSpan(context.active(), deferredSpan);

	const runWebhook = () =>
		context.with(ctxWithSpan, () =>
			Promise.resolve()
				.then(next)
				.catch((error) => {
					deferredSpan.recordException(error);
					deferredSpan.setStatus({ code: SpanStatusCode.ERROR });
					ctx.logger.error(
						`Stripe webhook background processing failed: ${error}`,
						{ error },
					);
				})
				.finally(() => deferredSpan.end()),
		);

	const waitUntil = getWaitUntil(c);
	if (waitUntil) {
		try {
			waitUntil(runWebhook());
		} catch (error) {
			deferredSpan.end();
			ctx.logger.error(`Stripe webhook waitUntil failed: ${error}`, { error });
		}
	} else {
		setImmediate(() => void runWebhook());
	}

	return c.json({ received: true }, 200);
};
