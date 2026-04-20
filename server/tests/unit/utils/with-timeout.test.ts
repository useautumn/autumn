import { describe, expect, test } from "bun:test";
import { withTimeout } from "@/utils/withTimeout.js";

describe("withTimeout", () => {
	test("returns the wrapped result before the timeout", async () => {
		const result = await withTimeout({
			timeoutMs: 50,
			fn: async () => "ok",
		});

		expect(result).toBe("ok");
	});

	test("rejects and runs onTimeout when the timeout elapses", async () => {
		let timedOut = false;

		await expect(
			withTimeout({
				timeoutMs: 10,
				fn: () => new Promise<string>(() => {}),
				onTimeout: () => {
					timedOut = true;
				},
			}),
		).rejects.toThrow("timed out after 10ms");

		expect(timedOut).toBe(true);
	});
});
