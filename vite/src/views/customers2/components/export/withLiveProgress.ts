import type {
	CustomerExportProgress,
	CustomerExportResponse,
} from "@autumn/shared";

/** Merges the realtime value over the polled copy of the active export. */
export function withLiveProgress({
	customerExports,
	activeExportId,
	progress,
}: {
	customerExports: CustomerExportResponse[];
	activeExportId: string | undefined;
	progress: CustomerExportProgress | null;
}): CustomerExportResponse[] {
	if (!(activeExportId && progress)) return customerExports;

	return customerExports.map((customerExport) =>
		customerExport.id === activeExportId
			? { ...customerExport, progress }
			: customerExport,
	);
}
