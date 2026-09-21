import { Readable } from "node:stream";
import type { BillingVerifyExportRow } from "@autumn/shared";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import {
	BILLING_VERIFY_CONCURRENCY,
	BILLING_VERIFY_EXPORT_PAGE_SIZE,
} from "../../verify/billingVerifyExportConfig.js";
import { filterBillingVerifyCandidates } from "../../verify/filterBillingVerifyCandidates.js";
import { setupBillingVerifySweep } from "../../verify/setupBillingVerifySweep.js";
import { verifyCustomerToExportRows } from "../../verify/verifyCustomerToExportRows.js";
import type { CustomerExportRowStreamFactory } from "./customerExportProducers.js";
import { walkCustomerExportPages } from "./walkCustomerExportPages.js";

export const createBillingVerifyExportRowStream: CustomerExportRowStreamFactory =
	({ ctx, snapshot, population, onPageProcessed }) => {
		const exportRows =
			async function* (): AsyncGenerator<BillingVerifyExportRow> {
				const sweep = await setupBillingVerifySweep({ ctx });

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
