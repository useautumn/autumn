import type {
	CustomerExportProgress,
	CustomerExportResponse,
} from "@autumn/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCustomerExportRealtime } from "../../hooks/useCustomerExportRealtime";
import { CustomerExportJobList } from "./CustomerExportJobList";

const MAX_REALTIME_RETRY_ATTEMPTS = 3;
const REALTIME_RETRY_DELAY_MS = 10_000;

// Realtime replaces the polled value outright: a retried run resets progress
// to 0, and any max-merge would keep showing the stale polled percentage.
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
			? { ...customerExport, progress }
			: customerExport,
	);
};

/** Owns one Trigger Realtime subscription; keyed remounts resubscribe it. */
function SubscribedCustomerExportJobList({
	customerExports,
	activeExport,
	isLoading,
	isInitialError,
	isRetrying,
	onExportComplete,
	onRetry,
	onRealtimeErroredChange,
}: {
	customerExports: CustomerExportResponse[];
	activeExport: CustomerExportResponse | undefined;
	isLoading: boolean;
	isInitialError: boolean;
	isRetrying: boolean;
	onExportComplete: () => void;
	onRetry: () => void;
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
			isInitialError={isInitialError}
			isRetrying={isRetrying}
			onRetry={onRetry}
		/>
	);
}

export function LiveCustomerExportJobList({
	customerExports,
	activeExport,
	isLoading,
	isInitialError,
	isRetrying,
	onExportComplete,
	onRetry,
	onRealtimeDegradedChange,
}: {
	customerExports: CustomerExportResponse[];
	activeExport: CustomerExportResponse | undefined;
	isLoading: boolean;
	isInitialError: boolean;
	isRetrying: boolean;
	onExportComplete: () => void;
	onRetry: () => void;
	onRealtimeDegradedChange: (isDegraded: boolean) => void;
}) {
	// The subscription binds run id and token on mount, so rotation remounts it.
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
			isInitialError={isInitialError}
			isRetrying={isRetrying}
			onExportComplete={onExportComplete}
			onRetry={onRetry}
			onRealtimeErroredChange={handleRealtimeErroredChange}
		/>
	);
}
