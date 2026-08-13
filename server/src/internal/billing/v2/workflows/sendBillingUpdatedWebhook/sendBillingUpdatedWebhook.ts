/**
 * Sends `billing.updated` with a freshly built BillingChangeResponse. Call it
 * fire-and-forget — errors are caught and logged rather than thrown.
 */

import {
	type AutumnBillingPlan,
	type FullCustomer,
	fullCustomerToTags,
	WebhookEventType,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { billingChangeResponseHasContent } from "@/internal/billing/v2/actions/buildBillingChanges/billingChangeResponseHasContent";
import { buildBillingChangeResponse } from "@/internal/billing/v2/actions/buildBillingChanges/buildBillingChangeResponse";

export const sendBillingUpdatedWebhook = async ({
	ctx,
	autumnBillingPlan,
	originalFullCustomer,
	tags,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	originalFullCustomer: FullCustomer;
	tags?: string[];
}): Promise<void> => {
	if (ctx.testOptions?.skipWebhooks) return;

	try {
		const response = buildBillingChangeResponse({
			ctx,
			originalFullCustomer,
			autumnBillingPlan,
			tags,
		});

		if (!billingChangeResponseHasContent(response)) return;

		// Svix message tags (separate from the payload `tags` field) — used
		// for routing/filtering at the Svix dashboard level. Mirrors the
		// pattern in sendProductsUpdated.
		const svixTags = fullCustomerToTags({ fullCustomer: originalFullCustomer });

		await sendSvixEvent({
			ctx,
			eventType: WebhookEventType.BillingUpdated,
			data: response,
			tags: svixTags,
		});

		ctx.logger.info(
			`[sendBillingUpdatedWebhook] Sent billing.updated for ${response.customer_id} (${response.plan_changes.length} changes${response.tags.length ? `, tags=${response.tags.join(",")}` : ""})`,
		);
	} catch (error) {
		ctx.logger.error(`[sendBillingUpdatedWebhook] Failed: ${error}`);
	}
};
