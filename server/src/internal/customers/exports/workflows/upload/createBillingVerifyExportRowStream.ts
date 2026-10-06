import { Readable } from "node:stream";
import {
	type BillingVerifyExportRow,
	type BillingVerifyExportSpec,
	CustomerExportPhase,
} from "@autumn/shared";
import {
	CUSTOMER_EXPORT_PAGE_SIZE,
	type CustomerExportScalarRow,
} from "../../queries/getCustomerExportScalars.js";
import { billingVerifyExportConfig } from "../../verify/billingVerifyExportConfig.js";
import { loadBillingVerifyCandidates } from "../../verify/loadBillingVerifyCandidates.js";
import { orphanedSubscriptionsToExportRows } from "../../verify/orphanedSubscriptionsToExportRows/orphanedSubscriptionsToExportRows.js";
import { releaseSweptSubscriptions } from "../../verify/releaseSweptSubscriptions.js";
import { setupBillingVerifySweep } from "../../verify/setupBillingVerifySweep.js";
import { toBatches } from "../../verify/toBatches.js";
import { verifyCustomerToExportRows } from "../../verify/verifyCustomerToExportRows.js";
import type { CustomerExportRowStreamFactory } from "./customerExportProducers.js";
import { mapStreamWithConcurrency } from "./mapStreamWithConcurrency.js";

const candidateBatches = async function* (
	candidates: CustomerExportScalarRow[],
): AsyncGenerator<CustomerExportScalarRow[]> {
	yield* toBatches({ items: candidates, size: CUSTOMER_EXPORT_PAGE_SIZE });
};

export const createBillingVerifyExportRowStream: CustomerExportRowStreamFactory<
	BillingVerifyExportSpec
> = ({ ctx, snapshot, population, progress, onPageProcessed }) => {
	const exportRows =
		async function* (): AsyncGenerator<BillingVerifyExportRow> {
			await progress?.setPhase(CustomerExportPhase.Scanning);
			const sweep = await setupBillingVerifySweep({
				ctx,
				onSubscriptionsScanned: (count) =>
					progress?.incrementProcessedRows(count),
			});
			const { candidates, sharedStripeCustomerIds } =
				await loadBillingVerifyCandidates({
					ctx,
					snapshot,
					population,
					sweep,
				});
			await progress?.setTotalRows(candidates.length);
			await progress?.setPhase(CustomerExportPhase.Exporting);

			const verified = mapStreamWithConcurrency({
				batches: candidateBatches(candidates),
				concurrency: billingVerifyExportConfig.customer.concurrency,
				run: (scalar: CustomerExportScalarRow) =>
					verifyCustomerToExportRows({ ctx, scalar, sweep }),
				onBatchSettled: async ({ batch, results }) => {
					releaseSweptSubscriptions({
						sweep,
						scalars: batch,
						sharedStripeCustomerIds,
					});
					await onPageProcessed({
						customerCount: batch.length,
						rowCount: results.reduce((total, rows) => total + rows.length, 0),
					});
				},
			});

			for await (const rows of verified) yield* rows;

			if (!snapshot.include_unlinked_stripe_customers) return;
			for await (const orphanRows of orphanedSubscriptionsToExportRows({
				ctx,
				sweep,
			})) {
				await onPageProcessed({
					customerCount: 0,
					rowCount: orphanRows.length,
				});
				yield* orphanRows;
			}
		};

	return Readable.from(exportRows(), { objectMode: true });
};
