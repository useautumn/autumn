import type { Context, Next } from "hono";
import type { StripeWebhookHonoEnv } from "./stripeWebhookContext";

export const stripeWebhookEarlyAckMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx");
	const runWebhook = () =>
		Promise.resolve()
			.then(next)
			.catch((error) => {
				ctx.logger.error(`Stripe webhook background processing failed: ${error}`, {
					error,
				});
			});

	try {
		c.executionCtx.waitUntil(runWebhook());
	} catch {
		setImmediate(() => void runWebhook());
	}

	return c.json({ received: true }, 200);
};
