import type { DbCustomerExport } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RunCustomerExportPayload } from "@/trigger/exports/customerExportTaskPayload.js";
import { findPublishedExportObject } from "../../findPublishedExportObject.js";
import { resolveCustomerExportPopulation } from "../../queries/getCustomerExportScalars.js";
import { markCompletedWithRetry } from "../complete/markCompletedWithRetry.js";

/** A retry can reconcile an object published before its completion write. */
export const reconcileUploadedExport = async ({
	ctx,
	logger,
	customerExport,
	payload,
	bucket,
	region,
}: {
	ctx: AutumnContext;
	logger: Logger;
	customerExport: DbCustomerExport;
	payload: RunCustomerExportPayload;
	bucket: string;
	region: string;
}): Promise<boolean> => {
	const published = await findPublishedExportObject({
		logger,
		customerExport,
		bucket,
		region,
	});
	if (published.status !== "published") return false;

	// The frozen population bounds make the uploaded row count re-derivable.
	const { totalCount } = await resolveCustomerExportPopulation({
		db: ctx.db,
		orgId: payload.orgId,
		env: payload.env,
		snapshot: customerExport.snapshot,
		createdAtCutoff: customerExport.created_at,
	});

	const completed = await markCompletedWithRetry({
		ctx,
		logger,
		exportId: customerExport.id,
		rowCount: totalCount,
		byteCount: published.byteCount,
	});
	if (completed) {
		logger.warn(
			"customer-export: reconciled export published before its status write",
			{ data: { exportId: customerExport.id } },
		);
	}
	return true;
};
