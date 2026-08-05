import { expect } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { DEFAULT_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

/**
 * Polls the Postgres-backed read (`skip_cache`) until a tracked deduction has
 * landed there.
 *
 * A `/track` deduction is applied to the Redis balance immediately and reaches
 * Postgres only when its async sync runs. Any full-subject invalidation in that
 * window — a Stripe webhook from an earlier attach, or the next attach's own
 * cache refresh — deletes the cached balance WITHOUT flushing it, and the usage
 * is then gone for good (the next read rebuilds from the pre-track Postgres
 * row). In `bun tw` the webhook hop is slow enough that those invalidations
 * routinely land after the track rather than before it.
 *
 * Waiting for the deduction to reach Postgres before the next step makes the
 * rest of the test immune to that race instead of racing it: once Postgres has
 * the value, a cache wipe simply rebuilds the same number.
 */
export const waitForTrackedUsageInDb = async ({
	autumn,
	customerId,
	featureId,
	balance,
	usage,
	timeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
}: {
	autumn: AutumnInt;
	customerId: string;
	featureId: string;
	balance: number;
	usage?: number;
	timeoutMs?: number;
}): Promise<ApiCustomerV3> =>
	pollUntilAsserted({
		fetch: () =>
			autumn.customers.get<ApiCustomerV3>(customerId, {
				skip_cache: "true",
			}),
		assert: (customer) => {
			const feature = customer.features?.[featureId];
			expect(
				feature,
				`Feature ${featureId} not found on ${customerId} (db read)`,
			).toBeDefined();
			expect(
				feature?.balance,
				`Tracked deduction for ${featureId} never reached Postgres for ${customerId}`,
			).toBe(balance);
			if (usage !== undefined) {
				expect(feature?.usage).toBe(usage);
			}
		},
		timeoutMs,
	});
