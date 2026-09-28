import { withTwStripeRequestDeadline } from "../../../../src/external/connect/clientCache/twStripeLimiter/twStripeRequestContext";
import type { createTestWait } from "../../testWait/createTestWait";

export const runStripeClockRequest = <T>({
	wait,
	run,
}: {
	wait: ReturnType<typeof createTestWait>;
	run: () => Promise<T>;
}) =>
	wait.run(() =>
		withTwStripeRequestDeadline({
			timeoutMs: wait.remainingMs(),
			signal: wait.signal,
			run,
		}),
	);
