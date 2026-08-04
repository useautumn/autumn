import type { DbCustomerExport } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { findPublishedExportObject } from "../../findPublishedExportObject.js";
import { markCompletedWithRetry } from "../complete/markCompletedWithRetry.js";

/** A retry can reconcile an object published before its completion write. */
export const reconcileUploadedExport = async ({
	ctx,
	logger,
	customerExport,
	bucket,
	region,
}: {
	ctx: AutumnContext;
	logger: Logger;
	customerExport: DbCustomerExport;
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

	await markCompletedWithRetry({
		ctx,
		logger,
		exportId: customerExport.id,
		rowCount: null,
		byteCount: published.byteCount,
	});
	logger.warn(
		"customer-export: reconciled export published before its status write",
		{ data: { exportId: customerExport.id } },
	);
	return true;
};
