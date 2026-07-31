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
}): { progress: CustomerExportProgress | null; isErrored: boolean } {
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

	// The hook never recovers on its own; callers remount this to resubscribe.
	if (error) return { progress: null, isErrored: true };

	return {
		progress: runMetadataToCustomerExportProgress({ metadata: run?.metadata }),
		isErrored: false,
	};
}
