import { describe, expect, test } from "bun:test";
import {
	createFailureBreaker,
	isTransientModalError,
	withTransientRetry,
} from "./provisionGuard.ts";

describe("isTransientModalError", () => {
	test("Modal control-plane throttling is transient", () => {
		expect(
			isTransientModalError(
				new Error(
					"/modal.client.ModalClient/SecretGetOrCreate RESOURCE_EXHAUSTED: Bandwidth exhausted or memory limit exceeded",
				),
			),
		).toBe(true);
		expect(isTransientModalError(new Error("14 UNAVAILABLE: io"))).toBe(true);
	});

	test("real boot failures are not", () => {
		expect(
			isTransientModalError(
				new Error("Autumn server exited early with code 1"),
			),
		).toBe(false);
	});
});

describe("withTransientRetry", () => {
	test("retries throttling until it succeeds", async () => {
		let calls = 0;
		const result = await withTransientRetry({
			baseDelayMs: 1,
			run: async () => {
				calls++;
				if (calls < 3) throw new Error("RESOURCE_EXHAUSTED: slow down");
				return "ok";
			},
		});
		expect(result).toBe("ok");
		expect(calls).toBe(3);
	});

	test("does not retry a non-transient error", async () => {
		let calls = 0;
		await expect(
			withTransientRetry({
				baseDelayMs: 1,
				run: async () => {
					calls++;
					throw new Error("boot failed");
				},
			}),
		).rejects.toThrow("boot failed");
		expect(calls).toBe(1);
	});
});

describe("createFailureBreaker", () => {
	test("scattered failures across a big fan-out never trip it", () => {
		const breaker = createFailureBreaker({ limit: 5 });
		for (let i = 0; i < 100; i++) {
			breaker.failure();
			breaker.failure();
			breaker.success();
		}
		expect(breaker.tripped()).toBe(false);
	});

	test("trips after `limit` failures in a row", () => {
		const breaker = createFailureBreaker({ limit: 5 });
		for (let i = 0; i < 5; i++) breaker.failure();
		expect(breaker.tripped()).toBe(true);
	});
});
