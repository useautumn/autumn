import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";

// Tight limits so the assertions are clear: per-org=4, per-customer=2.
// Must be set BEFORE the gate module is imported — its env reads happen at
// module init.
process.env.FULL_SUBJECT_PER_CUSTOMER_LIMIT = "2";
process.env.FULL_SUBJECT_PER_ORG_LIMIT = "4";

const { runWithFullSubjectGate } = await import(
	"@/internal/customers/repos/getFullSubject/getFullSubjectGate.js"
);

type Counter = {
	current: number;
	peak: number;
};

const makeCounter = (): Counter => ({ current: 0, peak: 0 });

const makeQueryFn =
	(counter: Counter, holdMs: number) =>
	async <T>(value: T): Promise<T> => {
		counter.current += 1;
		counter.peak = Math.max(counter.peak, counter.current);
		await new Promise((resolve) => setTimeout(resolve, holdMs));
		counter.current -= 1;
		return value;
	};

describe("runWithFullSubjectGate", () => {
	test("caps concurrent calls for the same customer at PER_CUSTOMER_LIMIT", async () => {
		const counter = makeCounter();
		const queryFn = makeQueryFn(counter, 30);
		const tasks = Array.from({ length: 10 }, (_, index) =>
			runWithFullSubjectGate({
				customerId: "cus-same",
				orgId: "org-a",
				env: AppEnv.Live,
				queryFn: () => queryFn(index),
			}),
		);
		const results = await Promise.all(tasks);
		expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		expect(counter.peak).toBeLessThanOrEqual(2);
		expect(counter.current).toBe(0);
	});

	test("different customers within the same org compete for the per-org cap", async () => {
		const counter = makeCounter();
		const queryFn = makeQueryFn(counter, 30);
		const tasks = Array.from({ length: 8 }, (_, index) =>
			runWithFullSubjectGate({
				customerId: `cus-${index}`,
				orgId: "org-shared",
				env: AppEnv.Live,
				queryFn: () => queryFn(index),
			}),
		);
		const results = await Promise.all(tasks);
		expect(new Set(results)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7]));
		expect(counter.peak).toBeLessThanOrEqual(4);
		expect(counter.peak).toBeGreaterThan(2);
		expect(counter.current).toBe(0);
	});

	test("different orgs do not share a cap — each has its own per-org limit", async () => {
		const counter = makeCounter();
		const queryFn = makeQueryFn(counter, 30);
		const tasks = Array.from({ length: 12 }, (_, index) =>
			runWithFullSubjectGate({
				customerId: `cus-${index}`,
				orgId: index < 6 ? "org-x" : "org-y",
				env: AppEnv.Live,
				queryFn: () => queryFn(index),
			}),
		);
		await Promise.all(tasks);
		expect(counter.peak).toBeLessThanOrEqual(8);
		expect(counter.peak).toBeGreaterThan(4);
		expect(counter.current).toBe(0);
	});

	test("missing customerId still goes through the per-org gate", async () => {
		const counter = makeCounter();
		const queryFn = makeQueryFn(counter, 20);
		const tasks = Array.from({ length: 10 }, (_, index) =>
			runWithFullSubjectGate({
				customerId: undefined,
				orgId: "org-no-cus",
				env: AppEnv.Live,
				queryFn: () => queryFn(index),
			}),
		);
		await Promise.all(tasks);
		expect(counter.peak).toBeLessThanOrEqual(4);
		expect(counter.current).toBe(0);
	});

	test("same customerId in different orgs does NOT share a per-customer cap", async () => {
		const counter = makeCounter();
		const queryFn = makeQueryFn(counter, 30);
		const tasks = [
			...Array.from({ length: 5 }, (_, index) =>
				runWithFullSubjectGate({
					customerId: "cus-shared-id",
					orgId: "org-a",
					env: AppEnv.Live,
					queryFn: () => queryFn(`a-${index}`),
				}),
			),
			...Array.from({ length: 5 }, (_, index) =>
				runWithFullSubjectGate({
					customerId: "cus-shared-id",
					orgId: "org-b",
					env: AppEnv.Live,
					queryFn: () => queryFn(`b-${index}`),
				}),
			),
		];
		await Promise.all(tasks);
		// Keys are scoped per-org so each org keeps its own per-customer cap.
		expect(counter.peak).toBeGreaterThan(2);
		expect(counter.peak).toBeLessThanOrEqual(4);
		expect(counter.current).toBe(0);
	});

	test("same customerId in live and sandbox of the same org do NOT share a per-customer cap", async () => {
		const counter = makeCounter();
		const queryFn = makeQueryFn(counter, 30);
		const tasks = [
			...Array.from({ length: 5 }, (_, index) =>
				runWithFullSubjectGate({
					customerId: "cus-live-vs-sandbox",
					orgId: "org-c",
					env: AppEnv.Live,
					queryFn: () => queryFn(`live-${index}`),
				}),
			),
			...Array.from({ length: 5 }, (_, index) =>
				runWithFullSubjectGate({
					customerId: "cus-live-vs-sandbox",
					orgId: "org-c",
					env: AppEnv.Sandbox,
					queryFn: () => queryFn(`sandbox-${index}`),
				}),
			),
		];
		await Promise.all(tasks);
		// Per-env keys — live and sandbox run independently, peak up to 4.
		expect(counter.peak).toBeGreaterThan(2);
		expect(counter.peak).toBeLessThanOrEqual(4);
		expect(counter.current).toBe(0);
	});

	test("rejection releases the per-customer and per-org slots", async () => {
		const counter = makeCounter();
		const failing = async () => {
			counter.current += 1;
			counter.peak = Math.max(counter.peak, counter.current);
			await new Promise((resolve) => setTimeout(resolve, 5));
			counter.current -= 1;
			throw new Error("boom");
		};

		const failures = await Promise.allSettled(
			Array.from({ length: 5 }, () =>
				runWithFullSubjectGate({
					customerId: "cus-reject",
					orgId: "org-reject",
					env: AppEnv.Live,
					queryFn: failing,
				}),
			),
		);
		expect(failures.every((result) => result.status === "rejected")).toBe(true);
		expect(counter.current).toBe(0);

		const queryFn = makeQueryFn(counter, 5);
		const followUp = await Promise.all(
			Array.from({ length: 4 }, (_, index) =>
				runWithFullSubjectGate({
					customerId: "cus-reject",
					orgId: "org-reject",
					env: AppEnv.Live,
					queryFn: () => queryFn(index),
				}),
			),
		);
		expect(followUp).toEqual([0, 1, 2, 3]);
		expect(counter.current).toBe(0);
	});
});
