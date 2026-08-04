import type { DbCustomerExport } from "@autumn/shared";
import type { CustomerExportDestination } from "@/external/aws/s3/customerExportsS3Config.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CustomerExportPopulation } from "../../queries/getCustomerExportScalars.js";
import { createCustomerExportRowStream } from "./createCustomerExportRowStream.js";
import { uploadCustomerExportCsvStream } from "./uploadCustomerExportCsvStream.js";

export const streamCustomerExportCsv = async ({
	ctx,
	customerExport,
	population,
	destination,
	onRowsProcessed,
}: {
	ctx: AutumnContext;
	customerExport: DbCustomerExport;
	population: CustomerExportPopulation;
	destination: CustomerExportDestination;
	onRowsProcessed?: (rowCount: number) => Promise<void> | void;
}): Promise<{ rowCount: number; byteCount: number }> => {
	const { fields, snapshot } = customerExport;
	let rowCount = 0;

	const rows = createCustomerExportRowStream({
		ctx,
		snapshot,
		population,
		onPageProcessed: async (pageRowCount) => {
			rowCount += pageRowCount;
			await onRowsProcessed?.(pageRowCount);
		},
	});

	const { byteCount } = await uploadCustomerExportCsvStream({
		rows,
		fields,
		destination,
	});

	return { rowCount, byteCount };
};
