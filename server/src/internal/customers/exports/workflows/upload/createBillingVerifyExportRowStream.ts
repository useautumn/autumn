import { Readable } from "node:stream";
import type { BillingVerifyExportRow } from "@autumn/shared";
import { dbReplica } from "@/db/initDrizzle.js";
import { mapWithConcurrency } from "@/internal/migrations/v2/batchOperations/execute/utils/mapWithConcurrency.js";
import { getCustomerExportScalars } from "../../queries/getCustomerExportScalars.js";
import { setupBillingVerifySweep } from "../../verify/setupBillingVerifySweep.js";
import { verifyCustomerToExportRows } from "../../verify/verifyCustomerToExportRows.js";
import type { CustomerExportRowStreamFactory } from "./customerExportProducers.js";

// Small pages keep progress moving on a run that can last an hour.
const BILLING_VERIFY_EXPORT_PAGE_SIZE = 200;
const BILLING_VERIFY_CONCURRENCY = 8;

export const createBillingVerifyExportRowStream: CustomerExportRowStreamFactory =
	({ ctx, snapshot, population, totalCount, onPageProcessed }) => {
		const readDb = dbReplica ?? ctx.db;

		const exportRows =
			async function* (): AsyncGenerator<BillingVerifyExportRow> {
				const sweep = await setupBillingVerifySweep({ ctx, totalCount });

				let afterInternalId: string | null = null;
				let hasMorePages = true;

				while (hasMorePages) {
					const scalars = await getCustomerExportScalars({
						db: readDb,
						orgId: ctx.org.id,
						env: ctx.env,
						snapshot,
						upperBoundInternalId: population.upperBoundInternalId,
						createdAtCutoff: population.createdAtCutoff,
						afterInternalId,
						limit: BILLING_VERIFY_EXPORT_PAGE_SIZE,
					});
					const lastScalar = scalars[scalars.length - 1];
					if (!lastScalar) break;

					const rows = (
						await mapWithConcurrency({
							items: scalars,
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

					afterInternalId = lastScalar.internal_id;
					hasMorePages = scalars.length === BILLING_VERIFY_EXPORT_PAGE_SIZE;
				}
			};

		return Readable.from(exportRows(), { objectMode: true });
	};
