import type { CustomerExportResponse, DbCustomerExport } from "@autumn/shared";

/** The S3 key and upload id stay server-side; downloads go through a presigned URL. */
export const customerExportToResponse = ({
	customerExport,
}: {
	customerExport: DbCustomerExport;
}): CustomerExportResponse => ({
	id: customerExport.id,
	status: customerExport.status,
	fields: customerExport.fields,
	snapshot: {
		search: customerExport.snapshot?.search ?? "",
		filters: customerExport.snapshot?.filters ?? {},
	},
	requested_by_user_id: customerExport.requested_by_user_id,
	row_count: customerExport.row_count,
	byte_count: customerExport.byte_count,
	error_message: customerExport.error_message,
	created_at: customerExport.created_at,
	started_at: customerExport.started_at,
	completed_at: customerExport.completed_at,
});
