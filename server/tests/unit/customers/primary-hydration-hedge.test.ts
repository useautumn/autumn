import { afterEach, describe, expect, test } from "bun:test";
import {
	_getActivePrimaryHydrationHedgesForTesting,
	_resetPrimaryHydrationHedgeForTesting,
	runPrimaryHydrationWithHedge,
} from "@/internal/customers/repos/getFullSubject/runPrimaryHydrationWithHedge.js";

const wait = (milliseconds: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const deferred = <T>() => {
	let resolvePromise!: (value: T) => void;
	let rejectPromise!: (reason: unknown) => void;
	const promise = new Promise<T>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return { promise, resolve: resolvePromise, reject: rejectPromise };
};

afterEach(() => {
	_resetPrimaryHydrationHedgeForTesting();
});

describe("runPrimaryHydrationWithHedge", () => {
	test("returns a fast primary result without starting a duplicate read", async () => {
		let hedgeCalls = 0;
		const events: string[] = [];

		const result = await runPrimaryHydrationWithHedge({
			primaryFn: async () => "primary",
			hedgeFn: async () => {
				hedgeCalls++;
				return "hedge";
			},
			hedgeAfterMs: 20,
			maxInFlightHedges: 1,
			onEvent: (event) => events.push(event),
		});
		await wait(30);

		expect(result).toBe("primary");
		expect(hedgeCalls).toBe(0);
		expect(events).toEqual([]);
		expect(_getActivePrimaryHydrationHedgesForTesting()).toBe(0);
	});

	test("returns the duplicate result when a slow primary crosses the hedge delay", async () => {
		const primary = deferred<string>();
		const events: string[] = [];

		const result = await runPrimaryHydrationWithHedge({
			primaryFn: () => primary.promise,
			hedgeFn: async () => "hedge",
			hedgeAfterMs: 10,
			maxInFlightHedges: 1,
			onEvent: (event) => events.push(event),
		});
		primary.resolve("late-primary");
		await wait(0);

		expect(result).toBe("hedge");
		expect(events).toEqual(["started", "hedge_won"]);
		expect(_getActivePrimaryHydrationHedgesForTesting()).toBe(0);
	});

	test("returns the primary when it wins after the duplicate starts", async () => {
		const primary = deferred<string>();
		const hedge = deferred<string>();
		const events: string[] = [];

		const resultPromise = runPrimaryHydrationWithHedge({
			primaryFn: () => primary.promise,
			hedgeFn: () => hedge.promise,
			hedgeAfterMs: 10,
			maxInFlightHedges: 1,
			onEvent: (event) => events.push(event),
		});
		await wait(20);
		expect(_getActivePrimaryHydrationHedgesForTesting()).toBe(1);

		primary.resolve("primary");
		expect(await resultPromise).toBe("primary");
		expect(events).toEqual(["started", "primary_won"]);
		// The capacity slot tracks the still-running duplicate, not the caller.
		expect(_getActivePrimaryHydrationHedgesForTesting()).toBe(1);

		hedge.resolve("late-hedge");
		await wait(0);
		expect(_getActivePrimaryHydrationHedgesForTesting()).toBe(0);
	});

	test("starts the duplicate immediately after an eligible primary failure", async () => {
		const primaryError = new Error("connection reset");
		const events: string[] = [];

		const result = await runPrimaryHydrationWithHedge({
			primaryFn: async () => {
				throw primaryError;
			},
			hedgeFn: async () => "hedge",
			hedgeAfterMs: 10_000,
			maxInFlightHedges: 1,
			shouldHedgeOnError: (error) => error === primaryError,
			onEvent: (event) => events.push(event),
		});

		expect(result).toBe("hedge");
		expect(events).toEqual(["started", "hedge_won"]);
	});

	test("does not bypass load shedding or retry deterministic primary failures", async () => {
		const primaryError = new Error("gate rejected");
		let hedgeCalls = 0;

		const error = await runPrimaryHydrationWithHedge({
			primaryFn: async () => {
				throw primaryError;
			},
			hedgeFn: async () => {
				hedgeCalls++;
				return "hedge";
			},
			hedgeAfterMs: 10_000,
			maxInFlightHedges: 1,
			shouldHedgeOnError: () => false,
		}).catch((caught) => caught);

		expect(error).toBe(primaryError);
		expect(hedgeCalls).toBe(0);
	});

	test("preserves the primary error when both independent reads fail", async () => {
		const primaryError = new Error("primary connection reset");
		const hedgeError = new Error("hedge connection reset");
		const events: string[] = [];

		const error = await runPrimaryHydrationWithHedge({
			primaryFn: async () => {
				throw primaryError;
			},
			hedgeFn: async () => {
				throw hedgeError;
			},
			hedgeAfterMs: 10_000,
			maxInFlightHedges: 1,
			shouldHedgeOnError: () => true,
			onEvent: (event) => events.push(event),
		}).catch((caught) => caught);

		expect(error).toBe(primaryError);
		expect(events).toEqual(["started", "both_failed"]);
		expect(_getActivePrimaryHydrationHedgesForTesting()).toBe(0);
	});

	test("skips rather than queues when the per-process duplicate cap is full", async () => {
		const firstPrimary = deferred<string>();
		const firstHedge = deferred<string>();
		const secondPrimary = deferred<string>();
		let hedgeCalls = 0;
		const secondEvents: string[] = [];

		const firstResult = runPrimaryHydrationWithHedge({
			primaryFn: () => firstPrimary.promise,
			hedgeFn: () => {
				hedgeCalls++;
				return firstHedge.promise;
			},
			hedgeAfterMs: 10,
			maxInFlightHedges: 1,
		});
		await wait(20);
		expect(_getActivePrimaryHydrationHedgesForTesting()).toBe(1);

		const secondResult = runPrimaryHydrationWithHedge({
			primaryFn: () => secondPrimary.promise,
			hedgeFn: async () => {
				hedgeCalls++;
				return "second-hedge";
			},
			hedgeAfterMs: 10,
			maxInFlightHedges: 1,
			onEvent: (event) => secondEvents.push(event),
		});
		await wait(20);
		secondPrimary.resolve("second-primary");

		expect(await secondResult).toBe("second-primary");
		expect(hedgeCalls).toBe(1);
		expect(secondEvents).toEqual(["skipped_capacity"]);

		firstHedge.resolve("first-hedge");
		expect(await firstResult).toBe("first-hedge");
		firstPrimary.resolve("late-first-primary");
		await wait(0);
		expect(_getActivePrimaryHydrationHedgesForTesting()).toBe(0);
	});

	test("supports empty, large, and special-character results without transforming them", async () => {
		const values = ["", "x".repeat(1024 * 1024), "emoji 🚀 null\0 quotes '\""];

		for (const value of values) {
			const result = await runPrimaryHydrationWithHedge({
				primaryFn: async () => value,
				hedgeFn: async () => "unused",
				hedgeAfterMs: 10,
				maxInFlightHedges: 1,
			});
			expect(result).toBe(value);
		}
	});
});
