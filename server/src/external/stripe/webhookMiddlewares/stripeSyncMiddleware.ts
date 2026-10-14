import { isSyncableEvent, processStripeSyncEvent } from "@autumn/stripe-sync";
import type { Context, Next } from "hono";
import { orgToAccountId } from "@/external/connect/connectUtils.js";
import { isStripeSyncEnabled } from "@/internal/misc/stripeSync/stripeSyncStore.js";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "./stripeWebhookContext.js";

export const syncStripeEventToSyncDb = ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const { logger, org, stripeEvent } = ctx;

	if (!org || !stripeEvent) return;
	if (
		process.env.NODE_ENV === "production" &&
		!isStripeSyncEnabled({ orgId: org.id, orgSlug: org.slug })
	)
		return;

	if (!isSyncableEvent({ eventType: stripeEvent.type })) return;

	try {
		const stripeAccountId =
			stripeEvent.account ?? orgToAccountId({ org, env: ctx.env });

		const logSyncFailure = (error: unknown) => {
			logger.warn(`Stripe sync failed for event ${stripeEvent.id}: ${error}`, {
				error: {
					message: error instanceof Error ? error.message : String(error),
				},
				data: {
					type: "stripe_sync_write_failed",
					eventId: stripeEvent.id,
					eventType: stripeEvent.type,
					orgId: org.id,
				},
			});
		};

		void processStripeSyncEvent({
			event: stripeEvent,
			stripeAccountId,
			orgId: org.id,
			env: ctx.env,
			onError: logSyncFailure,
		}).catch(logSyncFailure);
	} catch (error) {
		logger.error(`Stripe sync middleware error: ${error}`);
	}
};

export const stripeSyncMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	await next();

	const ctx = c.get("ctx") as StripeWebhookContext;
	syncStripeEventToSyncDb({ ctx });
};
