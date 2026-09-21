import type { DbCustomerExport } from "@autumn/shared";
import type { CustomerExportDestination } from "@/external/aws/s3/customerExportsS3Config.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CustomerExportPopulation } from "../../queries/getCustomerExportScalars.js";
import { CUSTOMER_EXPORT_PRODUCERS } from "./customerExportProducers.js";
import { uploadCustomerExportCsvStream } from "./uploadCustomerExportCsvStream.js";

export const streamCustomerExportCsv = async ({
	ctx,
	customerExport,
	population,
	totalCount,
	destination,
	onCustomersProcessed,
}: {
	ctx: AutumnContext;
	customerExport: DbCustomerExport;
	population: CustomerExportPopulation;
	totalCount: number;
	destination: CustomerExportDestination;
	onCustomersProcessed?: (customerCount: number) => Promise<void> | void;
}): Promise<{ rowCount: number; byteCount: number }> => {
	const { kind, fields, snapshot } = customerExport;
	const { createRowStream, createStringifier } =
		CUSTOMER_EXPORT_PRODUCERS[kind];
	let rowCount = 0;

	const rows = createRowStream({
		ctx,
		snapshot,
		population,
		totalCount,
		onPageProcessed: async (page) => {
			rowCount += page.rowCount;
			await onCustomersProcessed?.(page.customerCount);
		},
	});

	const { byteCount } = await uploadCustomerExportCsvStream({
		rows,
		stringifier: createStringifier({ fields }),
		destination,
	});

	return { rowCount, byteCount };
};
