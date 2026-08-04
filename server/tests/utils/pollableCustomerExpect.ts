import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { pollUntilAsserted } from "./genUtils.js";

/** Every pollable expect helper accepts these in place of a fetched customer. */
export type PollableExpectParams<C> = {
	customer?: C;
	customerId?: string;
	entityId?: string;
	skipCache?: boolean;
	/**
	 * Client the re-fetch goes through. Pin it from the test's own scenario
	 * (`autumnV2_2`, …) so a test keeps asserting against the API version it was
	 * written for; each helper falls back to the version its assertions were
	 * originally written against, never to "latest".
	 */
	autumn?: AutumnInt;
	/** Ceiling for the re-fetch loop; only used when polling. */
	settleTimeoutMs?: number;
};

const DEFAULT_SETTLE_TIMEOUT_MS = 30_000;

/**
 * THE one place polling lives.
 *
 * Wraps an expect helper so a caller may pass `customerId` instead of a
 * pre-fetched `customer`, and the helper re-fetches until its own assertions
 * hold — for state that settles asynchronously (Stripe webhooks, queue
 * workers), which is far slower on a contended CI box than locally.
 *
 * Passing `customer` keeps the original SYNCHRONOUS behaviour, so the hundreds
 * of existing un-awaited call sites are unaffected. Passing `customerId`
 * returns a promise that must be awaited.
 */
export const pollableCustomerExpect =
	<C, P extends PollableExpectParams<C>>({
		fetchCustomer,
		assert,
	}: {
		fetchCustomer: (params: P) => Promise<C>;
		/** Sync assertions keep the sync path sync; async ones (V5 routing) are
		 * awaited by callers that already await this helper. */
		assert: (params: P & { customer: C }) => void | Promise<void>;
	}) =>
	(params: P): void | Promise<void> => {
		if (params.customer) {
			return assert(params as P & { customer: C });
		}
		if (!params.customerId) {
			throw new Error("Pass either `customer` or `customerId`");
		}
		return pollUntilAsserted({
			fetch: () => fetchCustomer(params),
			assert: (customer) => assert({ ...params, customer }),
			timeoutMs: params.settleTimeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS,
		}).then(() => undefined);
	};
