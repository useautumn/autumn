import { Readable } from "node:stream";
import type {
	CustomPlansExportRow,
	CustomPlansExportSpec,
} from "@autumn/shared";
import { dbReplica } from "@/db/initDrizzle.js";
import type { BaseProductCache } from "@/internal/customers/cusProducts/actions/deriveIsCustom/loadBaseProduct.js";
import { customerToCustomPlansExportRows } from "../../customPlans/customerToCustomPlansExportRows.js";
import type { CustomerExportScalarRow } from "../../queries/getCustomerExportScalars.js";
import type { CustomerExportRowStreamFactory } from "./customerExportProducers.js";
import { mapStreamWithConcurrency } from "./mapStreamWithConcurrency.js";
import { walkCustomerExportPages } from "./walkCustomerExportPages.js";

/** Each customer is one full-customer read; the replica pool, not CPU, bounds throughput. */
const CUSTOM_PLANS_EXPORT_CONCURRENCY = 16;

export const createCustomPlansExportRowStream: CustomerExportRowStreamFactory<
	CustomPlansExportSpec
> = ({ ctx, snapshot, population, onPageProcessed }) => {
	const baseProducts: BaseProductCache = new Map();
	// Apply runs stay on the primary so compare-and-set judges current rows.
	const readCtx = { ...ctx, db: dbReplica ?? ctx.db };

	const exportRows = async function* (): AsyncGenerator<CustomPlansExportRow> {
		const pages = walkCustomerExportPages({ ctx, snapshot, population });

		const rowsPerCustomer = mapStreamWithConcurrency({
			batches: pages,
			concurrency: CUSTOM_PLANS_EXPORT_CONCURRENCY,
			run: (scalar: CustomerExportScalarRow) =>
				customerToCustomPlansExportRows({
					ctx: readCtx,
					scalar,
					snapshot,
					baseProducts,
				}),
			onBatchSettled: ({ batch, results }) =>
				onPageProcessed({
					customerCount: batch.length,
					rowCount: results.reduce((total, rows) => total + rows.length, 0),
				}),
		});

		for await (const rows of rowsPerCustomer) yield* rows;
	};

	return Readable.from(exportRows(), { objectMode: true });
};
