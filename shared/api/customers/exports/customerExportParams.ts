import { z } from "zod/v4";
import {
	CustomerExportFieldSchema,
	CustomerExportFieldsSchema,
	CustomerExportStatusSchema,
} from "../../../models/cusModels/cusExportModels.js";
import {
	BoundedCustomerListFiltersSchema,
	CustomerListFiltersSchema,
} from "../customerListFilters.js";

export const MAX_CUSTOMER_EXPORTS_PAGE_SIZE = 20;

// The snapshot is persisted and replayed in every export query, so its inputs
// are bounded at creation time.
export const MAX_CUSTOMER_EXPORT_SEARCH_LENGTH = 500;

export const CustomerExportSnapshotSchema = z.object({
	search: z.string().default(""),
	filters: CustomerListFiltersSchema.default({}),
});

export const CreateCustomerExportParamsSchema = z.object({
	fields: CustomerExportFieldsSchema,
	search: z
		.string()
		.max(MAX_CUSTOMER_EXPORT_SEARCH_LENGTH)
		.optional()
		.default(""),
	filters: BoundedCustomerListFiltersSchema.optional().default({}),
});

export type CreateCustomerExportParams = z.infer<
	typeof CreateCustomerExportParamsSchema
>;

export const ListCustomerExportsQuerySchema = z.object({
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(MAX_CUSTOMER_EXPORTS_PAGE_SIZE)
		.optional()
		.default(MAX_CUSTOMER_EXPORTS_PAGE_SIZE),
});

export type ListCustomerExportsQuery = z.infer<
	typeof ListCustomerExportsQuerySchema
>;

/** Live rows-processed counter read from the trigger run's metadata. */
export const CustomerExportProgressSchema = z.object({
	processed_rows: z.number(),
	total_rows: z.number(),
});

export type CustomerExportProgress = z.infer<
	typeof CustomerExportProgressSchema
>;

// Written by the export tasks into trigger run metadata; never stored in the DB.
// The dashboard reads the same keys over Trigger Realtime.
export const CUSTOMER_EXPORT_TOTAL_ROWS_KEY = "total_rows";
export const CUSTOMER_EXPORT_PROCESSED_ROWS_KEY = "processed_rows";

/** A retried run resets and re-counts, so processed is capped at the total. */
export const runMetadataToCustomerExportProgress = ({
	metadata,
}: {
	metadata: Record<string, unknown> | undefined;
}): CustomerExportProgress | null => {
	const totalRows = metadata?.[CUSTOMER_EXPORT_TOTAL_ROWS_KEY];
	if (
		typeof totalRows !== "number" ||
		!Number.isFinite(totalRows) ||
		totalRows < 0
	)
		return null;

	const processedRaw = metadata?.[CUSTOMER_EXPORT_PROCESSED_ROWS_KEY];
	const processedRows =
		typeof processedRaw === "number" && Number.isFinite(processedRaw)
			? processedRaw
			: 0;

	return {
		processed_rows: Math.min(Math.max(processedRows, 0), totalRows),
		total_rows: totalRows,
	};
};

export const CustomerExportResponseSchema = z.object({
	id: z.string(),
	status: CustomerExportStatusSchema,
	fields: z.array(CustomerExportFieldSchema),
	snapshot: CustomerExportSnapshotSchema,
	requested_by_user_id: z.string().nullable(),
	row_count: z.number().nullable(),
	byte_count: z.number().nullable(),
	error_message: z.string().nullable(),
	created_at: z.number(),
	started_at: z.number().nullable(),
	completed_at: z.number().nullable(),
	progress: CustomerExportProgressSchema.nullable(),
	trigger_run_id: z.string().nullable(),
	/** Run-scoped realtime token, minted only while the export is still active. */
	public_access_token: z.string().nullable(),
});

export type CustomerExportResponse = z.infer<
	typeof CustomerExportResponseSchema
>;

export const ListCustomerExportsResponseSchema = z.object({
	exports: z.array(CustomerExportResponseSchema),
});

export type ListCustomerExportsResponse = z.infer<
	typeof ListCustomerExportsResponseSchema
>;

export const DownloadCustomerExportResponseSchema = z.object({
	url: z.string(),
	expires_in: z.number(),
	file_name: z.string(),
});

export type DownloadCustomerExportResponse = z.infer<
	typeof DownloadCustomerExportResponseSchema
>;
