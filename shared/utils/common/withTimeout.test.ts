import { describe, expect, test } from "bun:test";
import { ms } from "./unixUtils.js";
import { withTimeout } from "./withTimeout.js";

const RESULT_TIMEOUT_MS = ms.seconds(0.05);
const ELAPSED_TIMEOUT_MS = ms.seconds(0.01);

describe("withTimeout", () => {
	test("returns the wrapped result before the timeout", async () => {
		const result = await withTimeout({
			timeoutMs: RESULT_TIMEOUT_MS,
			fn: async () => "ok",
		});

		expect(result).toBe("ok");
	});

	test("rejects and runs onTimeout when the timeout elapses", async () => {
		let timedOut = false;

		await expect(
			withTimeout({
				timeoutMs: ELAPSED_TIMEOUT_MS,
				fn: () => new Promise<string>(() => {}),
				onTimeout: () => {
					timedOut = true;
				},
			}),
		).rejects.toThrow(`timed out after ${ELAPSED_TIMEOUT_MS}ms`);

		expect(timedOut).toBe(true);
	});
});
