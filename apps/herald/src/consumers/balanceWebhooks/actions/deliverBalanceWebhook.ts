import type { MutationRecord } from "@autumn/balance-engine";
import type { BalanceWebhook } from "@autumn/balance-webhooks";
import type { AutumnLogger } from "@autumn/logging";
import type { SvixClient } from "@autumn/svix";
import { recordToWebhookAppId } from "./recordToWebhookAppId.js";

/** One webhook to the app its org delivers through; a failed send is logged, since one endpoint must not hold the partition. */
export const deliverBalanceWebhook = async ({
	ctx,
	record,
	webhook,
}: {
	ctx: {
		svix: Pick<SvixClient, "sendMessage">;
		logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	};
	record: MutationRecord;
	webhook: BalanceWebhook;
}): Promise<void> => {
	const appId = recordToWebhookAppId({ record });
	if (!appId) {
		ctx.logger.warn(
			{ type: "herald_webhook_no_app", data: { eventType: webhook.eventType } },
			"No webhook app on the record for this org and env; webhook skipped",
		);
		return;
	}
	try {
		await ctx.svix.sendMessage({ appId, message: webhook });
	} catch (cause) {
		ctx.logger.error(
			{
				error: cause,
				type: "herald_webhook_send_failed",
				data: { eventType: webhook.eventType },
			},
			"Could not deliver a balance webhook",
		);
		return;
	}
	ctx.logger.info(
		{ type: "herald_webhook_sent", data: { eventType: webhook.eventType } },
		"Delivered a balance webhook",
	);
};
