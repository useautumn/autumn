import type { DbCustomerExport } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RunCustomerExportPayload } from "@/trigger/exports/customerExportTaskPayload.js";
import { CustomerExportService } from "../../CustomerExportService.js";
import { resolveCustomerExportPopulation } from "../../queries/getCustomerExportScalars.js";
import type { CustomerExportProgressReporter } from "../customerExportProgressReporter.js";
import { streamCustomerExportCsv } from "./streamCustomerExportCsv.js";

export const uploadCustomerExportCsv = async ({
	ctx,
	logger,
	customerExport,
	payload,
	bucket,
	region,
	key,
	progress,
}: {
	ctx: AutumnContext;
	logger: Logger;
	customerExport: DbCustomerExport;
	payload: RunCustomerExportPayload;
	bucket: string;
	region: string;
	key: string;
	progress?: CustomerExportProgressReporter;
}): Promise<{ rowCount: number; byteCount: number }> => {
	const { exportId, orgId, env } = payload;

	const { population, totalCount } = await resolveCustomerExportPopulation({
		db: ctx.db,
		orgId,
		env,
		snapshot: customerExport.snapshot,
		createdAtCutoff: customerExport.created_at,
	});

	await CustomerExportService.markRunning({
		db: ctx.db,
		id: exportId,
		s3Key: key,
	});
	logger.info("customer-export: started", {
		data: { exportId, totalCount },
	});

	// The reporter is absent for inline runs; retries reset before re-walking.
	await progress?.setTotalRows(totalCount);
	await progress?.resetProcessedRows();

	return await streamCustomerExportCsv({
		ctx,
		customerExport,
		population,
		destination: { bucket, region, key },
		onRowsProcessed: (processedRows) =>
			progress?.incrementProcessedRows(processedRows),
	});
};
