import { Readable } from "node:stream";
import {
	type BillingVerifyExportRow,
	CustomerExportPhase,
} from "@autumn/shared";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import { billingVerifyExportConfig } from "../../verify/billingVerifyExportConfig.js";
import { filterBillingVerifyCandidates } from "../../verify/filterBillingVerifyCandidates.js";
import { releaseSweptSubscriptions } from "../../verify/releaseSweptSubscriptions.js";
import { setupBillingVerifySweep } from "../../verify/setupBillingVerifySweep.js";
import { verifyCustomerToExportRows } from "../../verify/verifyCustomerToExportRows.js";
import type { CustomerExportRowStreamFactory } from "./customerExportProducers.js";
import { walkCustomerExportPages } from "./walkCustomerExportPages.js";

export const createBillingVerifyExportRowStream: CustomerExportRowStreamFactory =
	({ ctx, snapshot, population, progress, onPageProcessed }) => {
		const exportRows =
			async function* (): AsyncGenerator<BillingVerifyExportRow> {
				await progress?.setPhase(CustomerExportPhase.Scanning);
				const sweep = await setupBillingVerifySweep({
					ctx,
					onSubscriptionsScanned: (count) =>
						progress?.incrementProcessedRows(count),
				});
				await progress?.setPhase(CustomerExportPhase.Exporting);

				const pages = walkCustomerExportPages({
					ctx,
					snapshot,
					population,
				});
				for await (const scalars of pages) {
					const { candidates, sharedStripeCustomerIds } =
						await filterBillingVerifyCandidates({ ctx, scalars, sweep });
					const rows = (
						await mapWithConcurrency({
							items: candidates,
							concurrency: billingVerifyExportConfig.customer.concurrency,
							run: (scalar) =>
								verifyCustomerToExportRows({ ctx, scalar, sweep }),
						})
					).flat();
					releaseSweptSubscriptions({
						sweep,
						scalars,
						sharedStripeCustomerIds,
					});
					yield* rows;

					await onPageProcessed({
						customerCount: scalars.length,
						rowCount: rows.length,
					});
				}
			};

		return Readable.from(exportRows(), { objectMode: true });
	};
