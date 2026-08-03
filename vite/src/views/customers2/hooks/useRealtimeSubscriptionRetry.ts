import { useCallback, useEffect, useRef, useState } from "react";

const MAX_REALTIME_RETRY_ATTEMPTS = 3;
const REALTIME_RETRY_DELAY_MS = 10_000;

// Realtime subscriptions never recover in place; retrying means remounting the
// subscriber, so recovery is driven by changing the returned subscriptionKey.
export function useRealtimeSubscriptionRetry({
	subscriptionTarget,
	onDegradedChange,
}: {
	subscriptionTarget: string;
	onDegradedChange: (isDegraded: boolean) => void;
}): {
	subscriptionKey: string;
	handleRealtimeErroredChange: (isErrored: boolean) => void;
} {
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
			onDegradedChange(isErrored);
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
		[onDegradedChange, retryAttempt, subscriptionTarget],
	);

	return {
		subscriptionKey: `${subscriptionTarget}:${retryAttempt}`,
		handleRealtimeErroredChange,
	};
}
