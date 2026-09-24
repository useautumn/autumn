import type { BalanceWebhookEffect } from "@autumn/balance-engine";
import type { AutumnLogger } from "@autumn/logging";
import type { SvixClient } from "@autumn/svix";
import type {
	StreamConsumer,
	StreamRecord,
} from "../../stream/types/streamConsumer.js";
import { deliverBalanceWebhook } from "./actions/deliverBalanceWebhook.js";

const isBalanceWebhookEffect = (effect: {
	type: string;
}): effect is BalanceWebhookEffect => effect.type === "balance_webhook";

/** Sends the webhooks the worker decided, one record at a time, so a customer's webhooks arrive in balance order. */
export function createBalanceWebhooksConsumer({
	ctx,
}: {
	ctx: {
		svix: SvixClient | null;
		logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	};
}): StreamConsumer {
	async function handle({
		records,
	}: {
		records: StreamRecord[];
	}): Promise<void> {
		const { svix } = ctx;
		if (!svix) return;
		for (const { record } of records) {
			const webhooks = (record.effects ?? []).filter(isBalanceWebhookEffect);
			for (const webhook of webhooks) {
				await deliverBalanceWebhook({ ctx: { ...ctx, svix }, record, webhook });
			}
		}
	}

	return { name: "balance-webhooks", handle };
}
