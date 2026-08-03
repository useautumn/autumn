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
	const subscriptionTarget = `${activeExport?.trigger_run_id ?? "no-run"}:${
		activeExport?.public_access_token ?? "no-token"
	}`;

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
