import type { Context, Next } from "hono";
import type { StripeWebhookHonoEnv } from "./stripeWebhookContext";

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
	const runWebhook = () =>
		Promise.resolve()
			.then(next)
			.catch((error) => {
				ctx.logger.error(`Stripe webhook background processing failed: ${error}`, {
					error,
				});
			});

	const waitUntil = getWaitUntil(c);
	if (waitUntil) {
		try {
			waitUntil(runWebhook());
		} catch (error) {
			ctx.logger.error(`Stripe webhook waitUntil failed: ${error}`, { error });
		}
	} else {
		setImmediate(() => void runWebhook());
	}

	return c.json({ received: true }, 200);
};
