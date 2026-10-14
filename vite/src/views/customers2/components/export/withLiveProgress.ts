import type {
	CustomerExportProgress,
	CustomerExportResponse,
} from "@autumn/shared";

export const liveProgressOf = ({
	polled,
	live,
}: {
	polled: CustomerExportProgress | null | undefined;
	live: CustomerExportProgress | null;
}): CustomerExportProgress | null => {
	if (!(live && polled)) return live ?? polled ?? null;
	if (polled.phase !== live.phase) return polled;
	return polled.processed_rows > live.processed_rows ? polled : live;
};

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
			? {
					...customerExport,
					progress: liveProgressOf({
						polled: customerExport.progress,
						live: progress,
					}),
				}
			: customerExport,
	);
}
