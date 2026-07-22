import { timeout } from "@/utils/genUtils.js";
import { expectPooledBalanceCorrect } from "./expectPooledBalanceCorrect.js";

type PooledBalanceExpectation = Parameters<
	typeof expectPooledBalanceCorrect
>[0];

export const waitForPooledBalanceCorrect = async ({
	timeoutMs = 60_000,
	pollIntervalMs = 1_000,
	...expectation
}: PooledBalanceExpectation & {
	timeoutMs?: number;
	pollIntervalMs?: number;
}) => {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;

	while (Date.now() < deadline) {
		try {
			return await expectPooledBalanceCorrect(expectation);
		} catch (error) {
			lastError = error;
			await timeout(pollIntervalMs);
		}
	}

	throw lastError ?? new Error("Timed out waiting for pooled balance state.");
};
