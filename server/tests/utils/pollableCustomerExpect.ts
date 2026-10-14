import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { pollUntilAsserted } from "./genUtils.js";

export type PollableExpectParams<C> = {
	customer?: C;
	customerId?: string;
	entityId?: string;
	skipCache?: boolean;
	autumn?: AutumnInt;
	settleTimeoutMs?: number;
};

export const DEFAULT_SETTLE_TIMEOUT_MS =
	Number(process.env.TEST_FILE_CONCURRENCY || "0") > 1 ? 45_000 : 30_000;

export const WEBHOOK_SETTLE_TIMEOUT_MS =
	Number(process.env.TEST_FILE_CONCURRENCY || "0") > 1 ? 150_000 : 30_000;

export const WEBHOOK_TEST_TIMEOUT_MS = 5 * 60_000;

export const pollableCustomerExpect =
	<C, P extends PollableExpectParams<C>>({
		fetchCustomer,
		assert,
	}: {
		fetchCustomer: (params: P) => Promise<C>;
		assert: (params: P & { customer: C }) => void | Promise<void>;
	}) =>
	(params: P): C | Promise<C> => {
		if (params.customer) {
			const asserted = assert(params as P & { customer: C });
			return asserted instanceof Promise
				? asserted.then(() => params.customer as C)
				: (params.customer as C);
		}
		if (!params.customerId) {
			throw new Error("Pass either `customer` or `customerId`");
		}
		return pollUntilAsserted({
			fetch: () => fetchCustomer(params),
			assert: (customer) => assert({ ...params, customer }),
			timeoutMs: params.settleTimeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS,
		});
	};
