import * as Sentry from "@sentry/bun";
import { getSentryTags } from "@/external/sentry/sentryUtils.js";
import { isStripeSyncEnabled } from "@/internal/misc/stripeSync/stripeSyncStore.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { setupSubCreatedContext } from "./setupSubCreatedContext.js";
import { autoSyncFromSubscription } from "./tasks/autoSyncFromSubscription.js";

export const handleSubCreated = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const { org, logger, stripeEvent } = ctx;

	// Gated in production; testable in dev/test (matches stripeSyncMiddleware).
	if (
		process.env.NODE_ENV === "production" &&
		!isStripeSyncEnabled({ orgId: org.id, orgSlug: org.slug })
	)
		return;

	const subCreatedContext = await setupSubCreatedContext({ ctx });
	if (!subCreatedContext) return;

	try {
		await autoSyncFromSubscription({ ctx, subCreatedContext });
	} catch (error) {
		logger.error(
			`sub.created auto-sync failed for stripe sub ${subCreatedContext.subscription.id}: ${error}`,
			{ error },
		);
		Sentry.captureException(error, {
			tags: getSentryTags({ ctx, method: stripeEvent.type }),
		});
	}
};
