import { useRealtimeSubscriptionRetry } from "../../hooks/useRealtimeSubscriptionRetry";
import {
	type CustomerExportJobListSubscriptionProps,
	SubscribedCustomerExportJobList,
} from "./SubscribedCustomerExportJobList";

export function LiveCustomerExportJobList({
	onRealtimeDegradedChange,
	...jobListProps
}: CustomerExportJobListSubscriptionProps & {
	onRealtimeDegradedChange: (isDegraded: boolean) => void;
}) {
	const { activeExport } = jobListProps;
	// Keyed on the run alone: any server instance mints its own token, so a
	// rotated token must not remount the subscription.
	const subscriptionTarget = activeExport?.trigger_run_id ?? "no-run";

	const { subscriptionKey, handleRealtimeErroredChange } =
		useRealtimeSubscriptionRetry({
			subscriptionTarget,
			onDegradedChange: onRealtimeDegradedChange,
		});

	return (
		<SubscribedCustomerExportJobList
			key={subscriptionKey}
			{...jobListProps}
			onRealtimeErroredChange={handleRealtimeErroredChange}
		/>
	);
}
