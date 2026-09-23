import { recordToBalanceWebhooks } from "@autumn/balance-webhooks";
import type { CatalogCache } from "@autumn/catalog-lru";
import type { AutumnLogger } from "@autumn/logging";
import type { SvixClient } from "@autumn/svix";
import type {
	StreamConsumer,
	StreamRecord,
} from "../../stream/types/streamConsumer.js";
import { deliverBalanceWebhook } from "./actions/deliverBalanceWebhook.js";
import { readRecordCatalog } from "./actions/readRecordCatalog.js";

/** Fires the webhooks each record calls for, one record at a time, so a customer's webhooks arrive in balance order. */
export function createBalanceWebhooksConsumer({
	ctx,
}: {
	ctx: {
		svix: SvixClient | null;
		catalogCache: Pick<CatalogCache, "read" | "load">;
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
			const catalog = await readRecordCatalog({ ctx, record });
			if (!catalog) continue;

			for (const webhook of recordToBalanceWebhooks({ record, catalog })) {
				await deliverBalanceWebhook({ ctx: { ...ctx, svix }, record, webhook });
			}
		}
	}

	return { name: "balance-webhooks", handle };
}
