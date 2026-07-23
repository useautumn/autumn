import { isSyncableEvent, processStripeSyncEvent } from "@autumn/stripe-sync";
import { orgToAccountId } from "@/external/connect/connectUtils.js";
import { isStripeSyncEnabled } from "@/internal/misc/stripeSync/stripeSyncStore.js";
import type { StripeWebhookContext } from "./stripeWebhookContext.js";

export const syncStripeWebhookEvent = async ({
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
		// Events from account-registered webhooks carry no `account` — resolve
		// from org connect config so sync rows are never left tenant-unstamped.
		const stripeAccountId =
			stripeEvent.account ?? orgToAccountId({ org, env: ctx.env });

		await processStripeSyncEvent({
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
