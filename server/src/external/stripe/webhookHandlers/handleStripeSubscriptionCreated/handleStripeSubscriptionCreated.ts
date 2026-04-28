import { isStripeSyncEnabled } from "@/internal/misc/stripeSync/stripeSyncStore.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { setupStripeSubscriptionCreatedContext } from "./setupStripeSubscriptionCreatedContext.js";
import { autoSyncFromSubscription } from "./tasks/autoSyncFromSubscription.js";

export const handleStripeSubscriptionCreated = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const { org } = ctx;

	// Gated in production; testable in dev/test (matches stripeSyncMiddleware).
	if (
		process.env.NODE_ENV === "production" &&
		!isStripeSyncEnabled({ orgId: org.id, orgSlug: org.slug })
	)
		return;

	const subscriptionCreatedContext = await setupStripeSubscriptionCreatedContext({ ctx });
	if (!subscriptionCreatedContext) return;

	await autoSyncFromSubscription({ ctx, subscriptionCreatedContext });
};
