import type {
	CustomerExportProgress,
	CustomerExportResponse,
} from "@autumn/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCustomerExportRealtime } from "../../hooks/useCustomerExportRealtime";
import { CustomerExportJobList } from "./CustomerExportJobList";

const MAX_REALTIME_RETRY_ATTEMPTS = 3;
const REALTIME_RETRY_DELAY_MS = 10_000;

/** Progress only moves forward, so a stalled stream must not undo the polled snapshot. */
const mergeProgress = ({
	polled,
	realtime,
}: {
	polled: CustomerExportProgress | null;
	realtime: CustomerExportProgress | null;
}): CustomerExportProgress | null => {
	if (!realtime) return polled;
	if (!polled) return realtime;

	return {
		processed_rows: Math.max(polled.processed_rows, realtime.processed_rows),
		total_rows: Math.max(polled.total_rows, realtime.total_rows),
	};
};

const withRealtimeProgress = ({
	customerExports,
	activeExportId,
	progress,
}: {
	customerExports: CustomerExportResponse[];
	activeExportId: string | undefined;
	progress: CustomerExportProgress | null;
}): CustomerExportResponse[] => {
	if (!(activeExportId && progress)) return customerExports;

	return customerExports.map((customerExport) =>
		customerExport.id === activeExportId
			? {
					...customerExport,
					progress: mergeProgress({
						polled: customerExport.progress,
						realtime: progress,
					}),
				}
			: customerExport,
	);
};

/** Owns exactly one Trigger Realtime subscription — remounting is what resubscribes. */
function SubscribedCustomerExportJobList({
	customerExports,
	activeExport,
	isLoading,
	onExportComplete,
	onRealtimeErroredChange,
}: {
	customerExports: CustomerExportResponse[];
	activeExport: CustomerExportResponse | undefined;
	isLoading: boolean;
	onExportComplete: () => void;
	onRealtimeErroredChange: (isErrored: boolean) => void;
}) {
	const { progress, isErrored } = useCustomerExportRealtime({
		customerExport: activeExport,
		onComplete: onExportComplete,
	});

	useEffect(() => {
		onRealtimeErroredChange(isErrored);
	}, [isErrored, onRealtimeErroredChange]);

	return (
		<CustomerExportJobList
			customerExports={withRealtimeProgress({
				customerExports,
				activeExportId: activeExport?.id,
				progress,
			})}
			isLoading={isLoading}
		/>
	);
}

export function LiveCustomerExportJobList({
	customerExports,
	activeExport,
	isLoading,
	onExportComplete,
	onRealtimeDegradedChange,
}: {
	customerExports: CustomerExportResponse[];
	activeExport: CustomerExportResponse | undefined;
	isLoading: boolean;
	onExportComplete: () => void;
	onRealtimeDegradedChange: (isDegraded: boolean) => void;
}) {
	// The subscription binds run id + token on mount, so a rotated token needs a remount.
	const subscriptionTarget = `${activeExport?.trigger_run_id ?? "no-run"}:${
		activeExport?.public_access_token ?? "no-token"
	}`;
	const [retry, setRetry] = useState({
		target: subscriptionTarget,
		attempt: 0,
	});
	const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const retryAttempt = retry.target === subscriptionTarget ? retry.attempt : 0;

	useEffect(
		() => () => {
			if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
			retryTimeoutRef.current = null;
		},
		[subscriptionTarget],
	);

	const handleRealtimeErroredChange = useCallback(
		(isErrored: boolean) => {
			onRealtimeDegradedChange(isErrored);
			if (!isErrored) return;
			if (retryTimeoutRef.current) return;
			if (retryAttempt >= MAX_REALTIME_RETRY_ATTEMPTS) return;

			retryTimeoutRef.current = setTimeout(
				() => {
					retryTimeoutRef.current = null;
					setRetry({ target: subscriptionTarget, attempt: retryAttempt + 1 });
				},
				REALTIME_RETRY_DELAY_MS * (retryAttempt + 1),
			);
		},
		[onRealtimeDegradedChange, retryAttempt, subscriptionTarget],
	);

	return (
		<SubscribedCustomerExportJobList
			key={`${subscriptionTarget}:${retryAttempt}`}
			customerExports={customerExports}
			activeExport={activeExport}
			isLoading={isLoading}
			onExportComplete={onExportComplete}
			onRealtimeErroredChange={handleRealtimeErroredChange}
		/>
	);
}
