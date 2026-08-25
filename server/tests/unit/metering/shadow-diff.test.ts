import { describe, expect, test } from "bun:test";
import { classifyBalancePair } from "@/internal/metering/shadowDiff/classifyBalancePair.js";

describe("classifyBalancePair", () => {
	test("equal balances match", () => {
		expect(classifyBalancePair({ apiBalance: 42, workerBalance: 42 })).toEqual({
			kind: "match",
		});
	});

	test("both sides at zero still match", () => {
		expect(classifyBalancePair({ apiBalance: 0, workerBalance: 0 })).toEqual({
			kind: "match",
		});
	});

	test("both sides missing counts as a match, not a mismatch", () => {
		expect(
			classifyBalancePair({ apiBalance: null, workerBalance: null }),
		).toEqual({ kind: "match" });
	});

	test("different balances mismatch, with delta as worker minus api", () => {
		expect(classifyBalancePair({ apiBalance: 10, workerBalance: 13 })).toEqual({
			kind: "mismatch",
			api: 10,
			worker: 13,
			delta: 3,
		});
	});

	test("mismatch delta is negative when the worker reads low", () => {
		expect(classifyBalancePair({ apiBalance: 10, workerBalance: 4 })).toEqual({
			kind: "mismatch",
			api: 10,
			worker: 4,
			delta: -6,
		});
	});

	test("api has a balance but the worker has none", () => {
		expect(classifyBalancePair({ apiBalance: 5, workerBalance: null })).toEqual(
			{ kind: "worker_missing", api: 5 },
		);
	});

	test("worker has a balance but the api has none", () => {
		expect(classifyBalancePair({ apiBalance: null, workerBalance: 5 })).toEqual(
			{ kind: "api_missing", worker: 5 },
		);
	});

	test("a worker balance of zero is a real reading, not a missing one", () => {
		expect(classifyBalancePair({ apiBalance: null, workerBalance: 0 })).toEqual(
			{ kind: "api_missing", worker: 0 },
		);
	});

	test("an api balance of zero is a real reading, not a missing one", () => {
		expect(classifyBalancePair({ apiBalance: 0, workerBalance: null })).toEqual(
			{ kind: "worker_missing", api: 0 },
		);
	});
});
