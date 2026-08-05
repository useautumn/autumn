import { expect } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import { DEFAULT_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import type { AutumnInt } from "@/external/autumn/autumnCli";

/**
 * Waits until a tracked deduction is durable in Postgres.
 *
 * `track` deducts in Redis and flushes to Postgres asynchronously, but
 * cycle-end overage billing reads Postgres only: the invoice.created webhook
 * loads the customer through `CusService.getFull` (see
 * stripeToAutumnCustomerMiddleware), which never consults Redis. A billing
 * action in between invalidates the Redis hash, and `syncItemV4` drops the
 * whole balance sync when its hash read misses — so an unflushed deduction is
 * lost and the overage line item is silently never created (the invoice comes
 * back short by exactly the overage).
 *
 * Gate on a `skip_cache` read, which bypasses Redis and does not write it back,
 * so the usage is provably in Postgres before the next billing action runs.
 */
export const waitForUsageSyncedToDb = async ({
	autumn,
	customerId,
	featureId,
	usage,
	timeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
}: {
	autumn: AutumnInt;
	customerId: string;
	featureId: string;
	usage: number;
	timeoutMs?: number;
}): Promise<void> => {
	await pollUntilAsserted({
		fetch: () =>
			autumn.customers.get<ApiCustomerV3>(customerId, {
				skip_cache: "true",
			}),
		assert: (customer) => {
			const feature = customer.features?.[featureId];
			expect(
				feature?.usage,
				`Tracked usage for ${featureId} never reached Postgres for ${customerId}`,
			).toBe(usage);
		},
		timeoutMs,
	});
};
