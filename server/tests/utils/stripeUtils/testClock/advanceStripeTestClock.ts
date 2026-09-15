import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { createTestWait } from "../../testWait/createTestWait";
import { getTestClockQueue } from "./getTestClockQueue";
import { runStripeClockRequest } from "./runStripeClockRequest";
import { waitForStripeClockReady } from "./waitForStripeClockReady";

export const advanceStripeTestClock = async ({
	stripeCli,
	testClockId,
	targetSeconds,
	settleMs = 0,
	timeoutMs = 180_000,
	signal,
}: {
	stripeCli: Stripe;
	testClockId: string;
	targetSeconds: number;
	settleMs?: number;
	timeoutMs?: number;
	signal?: AbortSignal;
}) => {
	const wait = createTestWait({
		timeoutMs,
		description: `Advance Stripe test clock ${testClockId} to ${targetSeconds}`,
		signal,
	});
	const queue = getTestClockQueue(testClockId);
	const advance = async () => {
		wait.remainingMs();
		if (queue.failedAdvance)
			throw new Error(
				`Stripe test clock ${testClockId} has an unresolved advancement`,
				{ cause: queue.failedAdvance.cause },
			);
		const clock = await waitForStripeClockReady({
			stripeCli,
			testClockId,
			wait,
		});
		if (targetSeconds <= clock.frozen_time)
			throw new Error(
				`Stripe test clock target must be after ${clock.frozen_time}`,
			);
		try {
			await runStripeClockRequest({
				wait,
				run: () =>
					stripeCli.testHelpers.testClocks.advance(
						testClockId,
						{ frozen_time: targetSeconds },
						{
							timeout: Math.min(30_000, wait.remainingMs()),
							maxNetworkRetries: 0,
							idempotencyKey: randomUUID(),
						},
					),
			});
			await waitForStripeClockReady({
				stripeCli,
				testClockId,
				targetSeconds,
				wait,
			});
			if (settleMs > 0) await wait.sleep(settleMs);
		} catch (cause) {
			// An interrupted write may still finish at Stripe; don't advance this clock again.
			queue.failedAdvance = { cause };
			throw cause;
		}
	};

	try {
		await wait.run(() => queue.run(advance));
	} finally {
		wait.close();
	}
};
