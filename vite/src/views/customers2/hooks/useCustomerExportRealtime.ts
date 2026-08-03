import {
	type CustomerExportProgress,
	type CustomerExportResponse,
	runMetadataToCustomerExportProgress,
} from "@autumn/shared";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { useEffect } from "react";

export function useCustomerExportRealtime({
	customerExport,
	onComplete,
	onErroredChange,
}: {
	customerExport: CustomerExportResponse | undefined;
	onComplete: () => void;
	onErroredChange?: (isErrored: boolean) => void;
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

	const isErrored = Boolean(error);

	useEffect(() => {
		onErroredChange?.(isErrored);
	}, [isErrored, onErroredChange]);

	// The subscription never recovers on its own; callers remount this to resubscribe.
	if (isErrored) return { progress: null };

	return {
		progress: runMetadataToCustomerExportProgress({ metadata: run?.metadata }),
	};
}
