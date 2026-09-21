import { Readable } from "node:stream";
import type { BillingVerifyExportRow } from "@autumn/shared";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import { filterBillingVerifyCandidates } from "../../verify/filterBillingVerifyCandidates.js";
import { setupBillingVerifySweep } from "../../verify/setupBillingVerifySweep.js";
import { verifyCustomerToExportRows } from "../../verify/verifyCustomerToExportRows.js";
import type { CustomerExportRowStreamFactory } from "./customerExportProducers.js";
import { walkCustomerExportPages } from "./walkCustomerExportPages.js";

// A page of live Stripe reads is slow, so small pages keep progress moving.
const BILLING_VERIFY_EXPORT_PAGE_SIZE = 40;
const BILLING_VERIFY_CONCURRENCY = 8;

export const createBillingVerifyExportRowStream: CustomerExportRowStreamFactory =
	({ ctx, snapshot, population, totalCount, onPageProcessed }) => {
		const exportRows =
			async function* (): AsyncGenerator<BillingVerifyExportRow> {
				const sweep = await setupBillingVerifySweep({ ctx, totalCount });

				const pages = walkCustomerExportPages({
					ctx,
					snapshot,
					population,
					pageSize: BILLING_VERIFY_EXPORT_PAGE_SIZE,
				});
				for await (const scalars of pages) {
					const candidates = await filterBillingVerifyCandidates({
						ctx,
						scalars,
						sweep,
					});
					const rows = (
						await mapWithConcurrency({
							items: candidates,
							concurrency: BILLING_VERIFY_CONCURRENCY,
							run: (scalar) =>
								verifyCustomerToExportRows({ ctx, scalar, sweep }),
						})
					).flat();
					yield* rows;

					await onPageProcessed({
						customerCount: scalars.length,
						rowCount: rows.length,
					});
				}
			};

		return Readable.from(exportRows(), { objectMode: true });
	};
