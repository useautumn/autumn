import pLimit from "p-limit";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrationWebhookRecord } from "../types/migrationWebhookRecord.js";
import { prefetchFullCustomers } from "./prefetchFullCustomers.js";
import { sendProductsUpdatedForRecord } from "./sendProductsUpdatedForRecord.js";

export const sendBatchProductsUpdatedWebhooks = async ({
	ctx,
	migrationRunId,
	records,
	concurrency,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	records: MigrationWebhookRecord[];
	concurrency: number;
}): Promise<{ delivered: number; failed: number }> => {
	const fullCustomersByInternalId = await prefetchFullCustomers({
		ctx,
		records,
	});

	let delivered = 0;
	let failed = 0;
	const limit = pLimit(concurrency);
	await Promise.all(
		records.map((record) =>
			limit(async () => {
				try {
					await sendProductsUpdatedForRecord({
						ctx,
						record,
						fullCustomer: fullCustomersByInternalId.get(
							record.internalCustomerId,
						),
					});
					delivered++;
				} catch (error) {
					failed++;
					ctx.logger.error(
						"migration-webhooks: products.updated delivery failed",
						{
							data: {
								migrationRunId,
								customerId: record.customerId,
								error: error instanceof Error ? error.message : String(error),
							},
						},
					);
				}
			}),
		),
	);

	return { delivered, failed };
};
