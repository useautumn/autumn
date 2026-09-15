import type Stripe from "stripe";
import type { createTestWait } from "../../testWait/createTestWait";

export const waitForStripeClockReady = async ({
	stripeCli,
	testClockId,
	targetSeconds,
	wait,
}: {
	stripeCli: Stripe;
	testClockId: string;
	targetSeconds?: number;
	wait: ReturnType<typeof createTestWait>;
}) => {
	for (;;) {
		const clock = await wait.run(() =>
			stripeCli.testHelpers.testClocks.retrieve(testClockId, {
				timeout: Math.min(10_000, wait.remainingMs()),
				maxNetworkRetries: 0,
			}),
		);
		if (clock.status === "internal_failure")
			throw new Error(`Stripe test clock ${testClockId} failed to advance`);
		if (targetSeconds !== undefined && clock.frozen_time > targetSeconds)
			throw new Error(
				`Stripe test clock ${testClockId} passed target ${targetSeconds}: ${clock.frozen_time}`,
			);
		const reachedTarget =
			targetSeconds === undefined || clock.frozen_time === targetSeconds;
		if (clock.status === "ready" && reachedTarget) return clock;
		await wait.sleep(3_000);
	}
};
