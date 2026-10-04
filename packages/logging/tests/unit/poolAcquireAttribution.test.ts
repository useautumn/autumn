import { expect, test } from "bun:test";
import { createPoolAcquireAttribution } from "../../src/metrics/poolAcquireAttribution.js";

test("counts and wait time are kept per route × reason, busiest first", () => {
	const attribution = createPoolAcquireAttribution();
	for (let index = 0; index < 3; index++)
		attribution.record({
			route: "POST /v1/entities.get",
			reason: "subject-cache-miss",
			waitMs: 100,
		});
	attribution.record({
		route: "POST /v1/balances.check",
		reason: "auth",
		waitMs: 2,
	});

	expect(attribution.drain()).toEqual({
		n: 4,
		waitMs: 302,
		keys: 2,
		rows: [
			{
				route: "POST /v1/entities.get",
				reason: "subject-cache-miss",
				n: 3,
				errors: 0,
				waitMs: 300,
				waitMaxMs: 100,
				waitP99Ms: 100,
			},
			{
				route: "POST /v1/balances.check",
				reason: "auth",
				n: 1,
				errors: 0,
				waitMs: 2,
				waitMaxMs: 2,
				waitP99Ms: 2,
			},
		],
	});
});

test("drain resets the window, and an empty window is null", () => {
	const attribution = createPoolAcquireAttribution();
	attribution.record({ route: "none", reason: "other", waitMs: 1 });
	expect(attribution.drain()?.n).toBe(1);
	expect(attribution.drain()).toBeNull();
});

test("failed checkouts count as errors and still carry their wait", () => {
	const attribution = createPoolAcquireAttribution();
	attribution.record({
		route: "POST /v1/track",
		reason: "other",
		waitMs: 15_000,
		failed: true,
	});
	expect(attribution.drain()?.rows[0]).toMatchObject({
		n: 1,
		errors: 1,
		waitMaxMs: 15_000,
	});
});

test("the p99 comes from a bounded sample, while count and sum stay exact", () => {
	const attribution = createPoolAcquireAttribution({ random: () => 0.999 });
	for (let index = 1; index <= 10_000; index++)
		attribution.record({ route: "r", reason: "x", waitMs: index });
	const row = attribution.drain()?.rows[0];
	expect(row?.n).toBe(10_000);
	expect(row?.waitMs).toBe(50_005_000);
	expect(row?.waitMaxMs).toBe(10_000);
	expect(row?.waitP99Ms).toBe(254);
});

test("keys past the cap fold into one overflow row; totals cover everything", () => {
	const attribution = createPoolAcquireAttribution();
	for (let index = 0; index < 70; index++)
		attribution.record({ route: `route-${index}`, reason: "other", waitMs: 1 });
	const window = attribution.drain();
	expect(window?.n).toBe(70);
	expect(window?.keys).toBe(65);
	expect(window?.rows).toHaveLength(20);
	expect(window?.rows[0]).toMatchObject({
		route: "(overflow)",
		reason: "mixed",
		n: 6,
	});
});
