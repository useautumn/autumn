import type {
	CustomerExportProgress,
	CustomerExportResponse,
} from "@autumn/shared";
import { useEffect } from "react";
import { useCustomerExportRealtime } from "../../hooks/useCustomerExportRealtime";
import { CustomerExportJobList } from "./CustomerExportJobList";

export type CustomerExportJobListSubscriptionProps = {
	customerExports: CustomerExportResponse[];
	activeExport: CustomerExportResponse | undefined;
	isLoading: boolean;
	isInitialError: boolean;
	isRetrying: boolean;
	onExportComplete: () => void;
	onRetry: () => void;
};

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

export function SubscribedCustomerExportJobList({
	customerExports,
	activeExport,
	isLoading,
	isInitialError,
	isRetrying,
	onExportComplete,
	onRetry,
	onRealtimeErroredChange,
}: CustomerExportJobListSubscriptionProps & {
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
