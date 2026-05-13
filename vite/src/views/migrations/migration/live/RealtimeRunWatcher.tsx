import {
	type RealtimeRunSubscription,
	useMigrationRunRealtime,
} from "../hooks/useMigrationRunRealtime";

export function RealtimeRunWatcher({
	subscription,
	onComplete,
}: {
	subscription: RealtimeRunSubscription;
	onComplete: (triggerRunId: string) => void;
}) {
	useMigrationRunRealtime({
		triggerRunId: subscription.triggerRunId,
		publicAccessToken: subscription.publicAccessToken,
		onComplete: () => onComplete(subscription.triggerRunId),
	});

	return null;
}
