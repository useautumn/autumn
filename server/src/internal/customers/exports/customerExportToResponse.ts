import type {
	CustomerExportProgress,
	CustomerExportResponse,
	DbCustomerExport,
} from "@autumn/shared";

/** The S3 key and upload id stay server-side; downloads go through a presigned URL. */
export const customerExportToResponse = ({
	customerExport,
	progress = null,
	triggerRunId = customerExport.trigger_run_id,
	publicAccessToken = null,
}: {
	customerExport: DbCustomerExport;
	progress?: CustomerExportProgress | null;
	triggerRunId?: string | null;
	publicAccessToken?: string | null;
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
	progress,
	trigger_run_id: triggerRunId,
	public_access_token: publicAccessToken,
});
