import type {
	CustomerExportProgress,
	CustomerExportResponse,
} from "@autumn/shared";
import { useCustomerExportRealtime } from "../../hooks/useCustomerExportRealtime";
import { CustomerExportJobList } from "./CustomerExportJobList";

/** Realtime is fresher than the polled snapshot, so it wins while it is live. */
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

/**
 * Owns one Trigger Realtime subscription. Callers must key this on the active
 * run id — a remount is what gives a second export a fresh subscription.
 */
export function LiveCustomerExportJobList({
	customerExports,
	activeExport,
	isLoading,
	onExportComplete,
}: {
	customerExports: CustomerExportResponse[];
	activeExport: CustomerExportResponse | undefined;
	isLoading: boolean;
	onExportComplete: () => void;
}) {
	const progress = useCustomerExportRealtime({
		customerExport: activeExport,
		onComplete: onExportComplete,
	});

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
