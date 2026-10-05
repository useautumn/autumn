import { Readable } from "node:stream";
import {
	type BillingVerifyExportRow,
	CustomerExportPhase,
} from "@autumn/shared";
import type { CustomerExportScalarRow } from "../../queries/getCustomerExportScalars.js";
import { billingVerifyExportConfig } from "../../verify/billingVerifyExportConfig.js";
import { filterBillingVerifyCandidates } from "../../verify/filterBillingVerifyCandidates.js";
import { releaseSweptSubscriptions } from "../../verify/releaseSweptSubscriptions.js";
import { setupBillingVerifySweep } from "../../verify/setupBillingVerifySweep.js";
import { verifyCustomerToExportRows } from "../../verify/verifyCustomerToExportRows.js";
import type { CustomerExportRowStreamFactory } from "./customerExportProducers.js";
import { mapStreamWithConcurrency } from "./mapStreamWithConcurrency.js";
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

				const pageContexts: Array<{
					scalars: CustomerExportScalarRow[];
					sharedStripeCustomerIds: Set<string>;
				}> = [];

				// Candidates cluster heavily in the oldest customers, so batching the
				// pool per page would leave it idle for most of the walk and then
				// bottleneck on the tail.
				const candidateBatches = async function* () {
					for await (const scalars of pages) {
						const { candidates, sharedStripeCustomerIds } =
							await filterBillingVerifyCandidates({ ctx, scalars, sweep });
						pageContexts.push({ scalars, sharedStripeCustomerIds });
						yield candidates;
					}
				};

				const verified = mapStreamWithConcurrency({
					batches: candidateBatches(),
					concurrency: billingVerifyExportConfig.customer.concurrency,
					run: (scalar: CustomerExportScalarRow) =>
						verifyCustomerToExportRows({ ctx, scalar, sweep }),
					onBatchSettled: async ({ batch, results }) => {
						const page = pageContexts.shift();
						if (!page) return;
						releaseSweptSubscriptions({
							sweep,
							scalars: page.scalars,
							sharedStripeCustomerIds: page.sharedStripeCustomerIds,
						});
						await onPageProcessed({
							customerCount: page.scalars.length,
							candidateCount: batch.length,
							rowCount: results.reduce((total, rows) => total + rows.length, 0),
						});
					},
				});

				for await (const rows of verified) yield* rows;
			};

		return Readable.from(exportRows(), { objectMode: true });
	};
