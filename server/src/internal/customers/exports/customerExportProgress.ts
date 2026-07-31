import type { CustomerExportProgress } from "@autumn/shared";
import { runs } from "@trigger.dev/sdk/v3";
import type { Logger } from "@/external/logtail/logtailUtils.js";

// Written by the export tasks into trigger run metadata; never stored in the DB.
export const CUSTOMER_EXPORT_TOTAL_ROWS_KEY = "total_rows";
export const CUSTOMER_EXPORT_PROCESSED_ROWS_KEY = "processed_rows";

/** Retried workers re-count their range, so processed is capped at the total. */
export const runMetadataToCustomerExportProgress = ({
	metadata,
}: {
	metadata: Record<string, unknown> | undefined;
}): CustomerExportProgress | null => {
	const totalRows = metadata?.[CUSTOMER_EXPORT_TOTAL_ROWS_KEY];
	if (typeof totalRows !== "number" || totalRows < 0) return null;

	const processedRaw = metadata?.[CUSTOMER_EXPORT_PROCESSED_ROWS_KEY];
	const processedRows = typeof processedRaw === "number" ? processedRaw : 0;

	return {
		processed_rows: Math.min(Math.max(processedRows, 0), totalRows),
		total_rows: totalRows,
	};
};

/** Progress is cosmetic, so any retrieval failure degrades to "no progress". */
export const getCustomerExportProgress = async ({
	triggerRunId,
	logger,
}: {
	triggerRunId: string;
	logger: Logger;
}): Promise<CustomerExportProgress | null> => {
	try {
		const run = await runs.retrieve(triggerRunId);
		return runMetadataToCustomerExportProgress({ metadata: run.metadata });
	} catch (error) {
		logger.warn("customer-export: failed to read run progress", {
			data: {
				triggerRunId,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		return null;
	}
};
