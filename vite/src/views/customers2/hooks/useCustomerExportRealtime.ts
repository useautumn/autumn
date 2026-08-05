import {
	type CustomerExportProgress,
	type CustomerExportResponse,
	runMetadataToCustomerExportProgress,
} from "@autumn/shared";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

export function useCustomerExportRealtime({
	customerExport,
	onComplete,
}: {
	customerExport: CustomerExportResponse | undefined;
	onComplete: () => void;
}): { progress: CustomerExportProgress | null } {
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

	// Polling still reports status, so a dead subscription only costs smoothness.
	if (error) return { progress: null };

	return {
		progress: runMetadataToCustomerExportProgress({ metadata: run?.metadata }),
	};
}
