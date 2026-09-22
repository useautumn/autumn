import type { MutationRecord } from "@autumn/balance-engine";
import {
	type BalanceWebhook,
	recordToBalanceWebhooks,
} from "@autumn/balance-webhooks";
import type { AutumnLogger } from "@autumn/logging";
import { AppEnv } from "@autumn/shared";
import { type SvixClient, svixConfigToAppId } from "@autumn/svix";
import { z } from "zod/v4";
import type {
	StreamConsumer,
	StreamRecord,
} from "../../stream/types/streamConsumer.js";

const appEnvSchema = z.enum(AppEnv);

/** The app the record's org delivers through, as stamped when the balance moved; null on older records or an org with none. */
const recordToWebhookAppId = ({
	record,
}: {
	record: MutationRecord;
}): string | null => {
	const { command, identity } = record;
	// Only the commands that move a balance name the org; an initialize does not, and fires nothing anyway.
	if (command.type !== "track" && command.type !== "finalize") return null;
	return svixConfigToAppId({
		svixConfig: command.org.svix,
		env: appEnvSchema.parse(identity.env),
	});
};

/**
 * Fires the webhooks each record calls for: limit reached, and later usage alerts. Records are handled in order,
 * one at a time, so a customer's webhooks arrive in the order their balance moved.
 */
export function createBalanceWebhooksConsumer({
	ctx,
}: {
	ctx: {
		svix: SvixClient | null;
		logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	};
}): StreamConsumer {
	async function deliver({
		record,
		webhook,
	}: {
		record: MutationRecord;
		webhook: BalanceWebhook;
	}): Promise<void> {
		if (!ctx.svix) return;
		const appId = recordToWebhookAppId({ record });
		if (!appId) {
			ctx.logger.warn(
				{
					type: "herald_webhook_no_app",
					data: { eventType: webhook.eventType },
				},
				"No webhook app on the record for this org and env; webhook skipped",
			);
			return;
		}
		await ctx.svix.sendMessage({ appId, message: webhook });
		ctx.logger.info(
			{ type: "herald_webhook_sent", data: { eventType: webhook.eventType } },
			"Delivered a balance webhook",
		);
	}

	async function handle({
		records,
	}: {
		records: StreamRecord[];
	}): Promise<void> {
		if (!ctx.svix) return;
		for (const { record } of records) {
			for (const webhook of recordToBalanceWebhooks({ record })) {
				try {
					await deliver({ record, webhook });
				} catch (cause) {
					// One customer's endpoint being down must not hold the partition; the miss is loud instead.
					ctx.logger.error(
						{
							error: cause,
							type: "herald_webhook_send_failed",
							data: { eventType: webhook.eventType },
						},
						"Could not deliver a balance webhook",
					);
				}
			}
		}
	}

	return { name: "balance-webhooks", handle };
}
