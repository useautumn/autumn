import { expect, test } from "bun:test";
import { handoffBalanceObservation } from "@/internal/balances/shadow/handoffBalanceObservation.js";
import type { LuaDeductionResult } from "@/internal/balances/utils/types/redisDeductionResult.js";
import { createCaptureFixture } from "./utils/captureFixture.js";

test("malformed payloads, metadata failures and cross-customer observations are not delivered", () => {
	const fixture = createCaptureFixture();
	for (const [result, reason] of [
		[{ observation: {} }, "observation_invalid_or_missing"],
		[{ observation_error: "metadata_invalid" }, "metadata_invalid"],
		[
			{ observation: { ...fixture.observation, customerId: "other" } },
			"observation_identity_mismatch",
		],
	] as const) {
		handoffBalanceObservation({
			...fixture,
			result: result as LuaDeductionResult,
		});
		expect(fixture.failures.at(-1)).toBe(reason);
	}
	expect(fixture.received).toEqual([]);
});

test("a full queue or throwing observer never changes the Lua result", () => {
	const fixture = createCaptureFixture();
	const result = {
		error: "INSUFFICIENT_BALANCE",
		observation: fixture.observation,
	} as LuaDeductionResult;
	const original = structuredClone(result);
	fixture.capture.tryEnqueue = () => false;
	handoffBalanceObservation({ ...fixture, result });
	fixture.capture.tryEnqueue = () => {
		throw new Error("queue failed");
	};
	handoffBalanceObservation({ ...fixture, result });
	expect(fixture.failures).toEqual(["observation_dropped", "observer_failed"]);
	fixture.capture.onUnavailable = () => {
		throw new Error("metrics failed");
	};
	expect(() => handoffBalanceObservation({ ...fixture, result })).not.toThrow();
	expect(result).toEqual(original);
});

test("only completed decisions are handed off, including duplicate observations", () => {
	const fixture = createCaptureFixture();
	for (const error of [
		"SUBJECT_VIEW_CHANGED",
		"SUBJECT_BALANCE_NOT_FOUND",
		"LOCK_ALREADY_EXISTS",
	])
		handoffBalanceObservation({
			...fixture,
			result: { error } as LuaDeductionResult,
		});
	expect(fixture.failures).toEqual([]);
	handoffBalanceObservation({
		...fixture,
		result: {
			error: "DUPLICATE_IDEMPOTENCY_KEY",
			observation: fixture.observation,
		} as LuaDeductionResult,
	});
	expect(fixture.received).toEqual([fixture.observation]);
});
