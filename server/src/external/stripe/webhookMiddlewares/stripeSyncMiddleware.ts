import { isSyncableEvent, processStripeSyncEvent } from "@autumn/stripe-sync";
import type { Context, Next } from "hono";
import { isStripeSyncEnabled } from "@/internal/misc/stripeSync/stripeSyncStore.js";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "./stripeWebhookContext.js";

/**
 * Post-handler middleware that syncs Stripe events to the sync DB.
 * Fire-and-forget -- errors are caught and logged, never propagated.
 */
export const stripeSyncMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	await next();

	const ctx = c.get("ctx") as StripeWebhookContext;
	const { logger, org, stripeEvent } = ctx;

	if (!org || !stripeEvent) return;
	if (
		process.env.NODE_ENV === "production" &&
		!isStripeSyncEnabled({ orgId: org.id })
	)
		return;

	if (!isSyncableEvent({ eventType: stripeEvent.type })) return;

	try {
		const stripeAccountId = stripeEvent.account ?? undefined;

		void processStripeSyncEvent({
			event: stripeEvent,
			stripeAccountId,
			orgId: org.id,
			env: ctx.env,
		}).catch((error) => {
			logger.error(`Stripe sync failed for event ${stripeEvent.id}: ${error}`, {
				error: {
					message: error instanceof Error ? error.message : String(error),
				},
				data: {
					eventId: stripeEvent.id,
					eventType: stripeEvent.type,
					orgId: org.id,
				},
			});
		});
	} catch (error) {
		logger.error(`Stripe sync middleware error: ${error}`);
	}
};
