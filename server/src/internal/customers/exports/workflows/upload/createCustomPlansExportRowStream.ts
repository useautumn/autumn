import { Readable } from "node:stream";
import type {
	CustomPlansExportRow,
	CustomPlansExportSpec,
} from "@autumn/shared";
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

	const exportRows = async function* (): AsyncGenerator<CustomPlansExportRow> {
		const pages = walkCustomerExportPages({ ctx, snapshot, population });

		const rowsPerCustomer = mapStreamWithConcurrency({
			batches: pages,
			concurrency: CUSTOM_PLANS_EXPORT_CONCURRENCY,
			run: (scalar: CustomerExportScalarRow) =>
				customerToCustomPlansExportRows({
					ctx,
					scalar,
					filters: snapshot.filters,
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
