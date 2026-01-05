import { AuthType } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { StripeWebhookHonoEnv } from "./stripeWebhookContext";

export const stripeInitLoggerMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx");
	const { stripeEvent, org, env, customer } = ctx;

	ctx.logger = ctx.logger.child({
		context: {
			context: {
				event_type: stripeEvent.type,
				event_id: stripeEvent.id,
				// @ts-expect-error
				object_id: `${stripeEvent.data?.object?.id}` || "N/A",
				authType: AuthType.Stripe,
				org_id: org.id,
				org_slug: org.slug,
				env,
				customer_id: customer?.id,
			},
		},
	});

	await next();
};
