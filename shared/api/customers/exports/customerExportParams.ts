import { z } from "zod/v4";
import {
	CustomerExportFieldSchema,
	CustomerExportFieldsSchema,
	CustomerExportStatusSchema,
} from "../../../models/cusModels/cusExportModels.js";
import { CustomerListFiltersSchema } from "../customerListFilters.js";

export const MAX_CUSTOMER_EXPORTS_PAGE_SIZE = 20;

export const CustomerExportSnapshotSchema = z.object({
	search: z.string().default(""),
	filters: CustomerListFiltersSchema.default({}),
});

export const CreateCustomerExportParamsSchema = z.object({
	fields: CustomerExportFieldsSchema,
	search: z.string().optional().default(""),
	filters: CustomerListFiltersSchema.optional().default({}),
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

/** Error body returned with 409 when another export is already active. */
export type CustomerExportInProgressData = {
	active_export_id: string;
};
