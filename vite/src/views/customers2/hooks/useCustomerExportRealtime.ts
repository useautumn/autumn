import {
	type CustomerExportProgress,
	type CustomerExportResponse,
	runMetadataToCustomerExportProgress,
} from "@autumn/shared";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

/**
 * Subscribes to the export's PARENT run — workers report into `metadata.root`,
 * so the parent is the only run carrying whole-export progress.
 */
export function useCustomerExportRealtime({
	customerExport,
	onComplete,
}: {
	customerExport: CustomerExportResponse | undefined;
	onComplete: () => void;
}): CustomerExportProgress | null {
	const triggerRunId = customerExport?.trigger_run_id ?? undefined;
	const publicAccessToken = customerExport?.public_access_token ?? undefined;
	// Without a token the underlying api client throws, so it must stay disabled.
	const enabled = Boolean(triggerRunId && publicAccessToken);

	const { run, error } = useRealtimeRun(triggerRunId, {
		accessToken: publicAccessToken,
		enabled,
		skipColumns: ["payload", "output"],
		onComplete,
	});

	// A dropped subscription falls back to the polled snapshot.
	if (error) return null;

	return runMetadataToCustomerExportProgress({ metadata: run?.metadata });
}
