import type { DbCustomerExport } from "@autumn/shared";
import type { CustomerExportDestination } from "@/external/aws/s3/customerExportsS3Config.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerExportToSpec } from "../../customerExportToSpec.js";
import type { CustomerExportPopulation } from "../../queries/getCustomerExportScalars.js";
import type { CustomerExportProgressReporter } from "../customerExportProgressReporter.js";
import { createExportStreams } from "./customerExportProducers.js";
import { uploadCustomerExportCsvStream } from "./uploadCustomerExportCsvStream.js";

export const streamCustomerExportCsv = async ({
	ctx,
	customerExport,
	population,
	destination,
	progress,
	onCustomersProcessed,
}: {
	ctx: AutumnContext;
	customerExport: DbCustomerExport;
	population: CustomerExportPopulation;
	destination: CustomerExportDestination;
	progress?: CustomerExportProgressReporter;
	onCustomersProcessed?: (customerCount: number) => Promise<void> | void;
}): Promise<{ rowCount: number; byteCount: number }> => {
	let rowCount = 0;
	const streamArgs = {
		ctx,
		population,
		progress,
		onPageProcessed: async (page: {
			customerCount: number;
			rowCount: number;
		}) => {
			rowCount += page.rowCount;
			await onCustomersProcessed?.(page.customerCount);
		},
	};

	const { byteCount } = await uploadCustomerExportCsvStream({
		...createExportStreams({
			spec: customerExportToSpec({ customerExport }),
			streamArgs,
		}),
		destination,
	});

	return { rowCount, byteCount };
};
