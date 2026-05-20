/**
 * Sends the `billing.updated` webhook with a freshly built BillingChangeResponse.
 *
 * Skips when:
 *   - `ctx.testOptions?.skipWebhooks` is set
 *   - the resulting response has no `plan_changes`
 *
 * Intended to be called fire-and-forget from emission sites:
 *   `void sendBillingUpdatedWebhook({ ctx, autumnBillingPlan, originalFullCustomer });`
 * Errors are caught and logged internally.
 */

import {
	type AutumnBillingPlan,
	type FullCustomer,
	WebhookEventType,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildBillingChangeResponse } from "@/internal/billing/v2/utils/billingChangeResponse";

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

		if (response.plan_changes.length === 0) return;

		await sendSvixEvent({
			ctx,
			eventType: WebhookEventType.BillingUpdated,
			data: response,
		});

		ctx.logger.info(
			`[sendBillingUpdatedWebhook] Sent billing.updated for ${response.customer_id} (${response.plan_changes.length} changes${response.tags.length ? `, tags=${response.tags.join(",")}` : ""})`,
		);
	} catch (error) {
		ctx.logger.error(`[sendBillingUpdatedWebhook] Failed: ${error}`);
	}
};
