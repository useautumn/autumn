import { pollUntilAsserted } from "@tests/utils/genUtils";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";

/**
 * Re-runs a webhook-gated assertion until it holds.
 *
 * For helpers that read Stripe/DB state directly (`expectSubToBeCorrect`,
 * `expectNoStripeSubscription`) and so cannot use `pollableCustomerExpect`.
 * After a cycle advance the old subscription is deleted and the scheduled one
 * created by webhook, so a single snapshot read lands mid-transition — an
 * "expect(received).toBeDefined()" on a subscription that exists a second
 * later. Polling exits the moment the assertion holds, so the happy path pays
 * nothing.
 */
export const expectEventually = async (
	assert: () => unknown | Promise<unknown>,
	{ timeoutMs = WEBHOOK_SETTLE_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<void> => {
	await pollUntilAsserted({
		fetch: async () => undefined,
		assert,
		timeoutMs,
	});
};
