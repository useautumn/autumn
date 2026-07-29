import { beforeAll, describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	runWithFullSubjectGate,
	toPerProcessLimit,
} from "@/internal/customers/repos/getFullSubject/getFullSubjectGate.js";
import { _setFullSubjectGateConfigForTesting } from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js";

beforeAll(() => {
	_setFullSubjectGateConfigForTesting({
		config: {
			per_customer_limit: 2,
			per_org_limit: 4,
			max_wait_ms: 60_000,
			per_customer_pending_max: 1000,
			per_org_pending_max: 1000,
		},
	});
});

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
		expect(counter.peak).toBeGreaterThan(2);
		expect(counter.peak).toBeLessThanOrEqual(4);
		expect(counter.current).toBe(0);
	});

	test("limit changes take effect at runtime without recreating limiters", async () => {
		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 1,
				per_org_limit: 4,
				max_wait_ms: 60_000,
				per_customer_pending_max: 1000,
				per_org_pending_max: 1000,
			},
		});

		const counter = makeCounter();
		const queryFn = makeQueryFn(counter, 20);
		const tasks = Array.from({ length: 5 }, (_, index) =>
			runWithFullSubjectGate({
				customerId: "cus-runtime-change",
				orgId: "org-runtime-change",
				env: AppEnv.Live,
				queryFn: () => queryFn(index),
			}),
		);
		await Promise.all(tasks);
		expect(counter.peak).toBe(1);

		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 2,
				per_org_limit: 4,
				max_wait_ms: 60_000,
				per_customer_pending_max: 1000,
				per_org_pending_max: 1000,
			},
		});
	});

	test("rejects with 429 when per-customer pending queue is full", async () => {
		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 1,
				per_org_limit: 100,
				max_wait_ms: 60_000,
				per_customer_pending_max: 2,
				per_org_pending_max: 1000,
			},
		});

		const slow = () => new Promise((resolve) => setTimeout(resolve, 100));
		const results = await Promise.allSettled(
			Array.from({ length: 10 }, () =>
				runWithFullSubjectGate({
					customerId: "cus-queue-full",
					orgId: "org-queue-full",
					env: AppEnv.Live,
					queryFn: slow,
				}),
			),
		);

		const rejected = results.filter((r) => r.status === "rejected");
		expect(rejected.length).toBeGreaterThan(0);
		for (const r of rejected as PromiseRejectedResult[]) {
			expect(r.reason.statusCode).toBe(429);
			expect(r.reason.code).toBe("rate_limit_exceeded");
		}

		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 2,
				per_org_limit: 4,
				max_wait_ms: 60_000,
				per_customer_pending_max: 1000,
				per_org_pending_max: 1000,
			},
		});
	});

	test("rejects with 429 (per_org_queue_full) when per-org queue fills via many customers in one org", async () => {
		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 1,
				per_org_limit: 1,
				max_wait_ms: 60_000,
				per_customer_pending_max: 1000,
				per_org_pending_max: 2,
			},
		});

		const slow = () => new Promise((resolve) => setTimeout(resolve, 100));
		const results = await Promise.allSettled(
			Array.from({ length: 10 }, (_, idx) =>
				runWithFullSubjectGate({
					customerId: `cus-org-cap-${idx}`,
					orgId: "org-cap",
					env: AppEnv.Live,
					queryFn: slow,
				}),
			),
		);

		const rejectedReasons = results
			.filter((r) => r.status === "rejected")
			.map(
				(r) =>
					(r as PromiseRejectedResult).reason.data?.reason as
						| string
						| undefined,
			);
		expect(rejectedReasons.length).toBeGreaterThan(0);
		expect(
			rejectedReasons.some((reason) => reason === "per_org_queue_full"),
		).toBe(true);
		for (const r of results.filter(
			(x) => x.status === "rejected",
		) as PromiseRejectedResult[]) {
			expect(r.reason.statusCode).toBe(429);
			expect(r.reason.code).toBe("rate_limit_exceeded");
		}

		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 2,
				per_org_limit: 4,
				max_wait_ms: 60_000,
				per_customer_pending_max: 1000,
				per_org_pending_max: 1000,
			},
		});
	});

	test("rejects with 429 when a queued request exceeds max_wait_ms", async () => {
		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 1,
				per_org_limit: 100,
				max_wait_ms: 30,
				per_customer_pending_max: 1000,
				per_org_pending_max: 1000,
			},
		});

		const slow = () => new Promise((resolve) => setTimeout(resolve, 80));
		const results = await Promise.allSettled(
			Array.from({ length: 4 }, () =>
				runWithFullSubjectGate({
					customerId: "cus-wait-timeout",
					orgId: "org-wait-timeout",
					env: AppEnv.Live,
					queryFn: slow,
				}),
			),
		);

		const timeouts = results.filter(
			(r) =>
				r.status === "rejected" &&
				(r as PromiseRejectedResult).reason.code === "rate_limit_exceeded",
		);
		expect(timeouts.length).toBeGreaterThan(0);

		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 2,
				per_org_limit: 4,
				max_wait_ms: 60_000,
				per_customer_pending_max: 1000,
				per_org_pending_max: 1000,
			},
		});
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

describe("toPerProcessLimit", () => {
	test("floors the cluster-wide target divided by fleet size, with a floor of 1", () => {
		expect(toPerProcessLimit(16, 1)).toBe(16);
		expect(toPerProcessLimit(16, 4)).toBe(4);
		expect(toPerProcessLimit(200, 44)).toBe(4);
		expect(toPerProcessLimit(16, 44)).toBe(1);
		expect(toPerProcessLimit(1, 1)).toBe(1);
	});

	test("treats a fleet size below 1 as 1 (no divide-by-zero)", () => {
		expect(toPerProcessLimit(16, 0)).toBe(16);
	});

	test("never lets cluster-wide capacity exceed the configured target", () => {
		for (const target of [8, 10, 16, 17, 50, 200, 500]) {
			for (const fleet of [1, 3, 4, 20, 44]) {
				const perProcess = toPerProcessLimit(target, fleet);
				if (target >= fleet) {
					expect(perProcess * fleet).toBeLessThanOrEqual(target);
				} else {
					expect(perProcess).toBe(1);
				}
			}
		}
	});
});

describe("runWithFullSubjectGate cluster-wide caps", () => {
	test("fleet_process_count divides the per-org concurrency cap", async () => {
		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 100,
				per_org_limit: 8,
				fleet_process_count: 4,
				max_wait_ms: 60_000,
				per_customer_pending_max: 1000,
				per_org_pending_max: 1000,
			},
		});

		const counter = makeCounter();
		const queryFn = makeQueryFn(counter, 30);
		const tasks = Array.from({ length: 12 }, (_, index) =>
			runWithFullSubjectGate({
				customerId: `cus-${index}`,
				orgId: "org-clusterwide-org",
				env: AppEnv.Live,
				queryFn: () => queryFn(index),
			}),
		);
		await Promise.all(tasks);
		// 8 cluster-wide / 4 processes = 2 per process
		expect(counter.peak).toBeLessThanOrEqual(2);
		expect(counter.peak).toBeGreaterThan(1);
		expect(counter.current).toBe(0);

		_setFullSubjectGateConfigForTesting({ config: {} });
	});

	test("fleet_process_count divides the per-customer concurrency cap", async () => {
		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 8,
				per_org_limit: 100,
				fleet_process_count: 4,
				max_wait_ms: 60_000,
				per_customer_pending_max: 1000,
				per_org_pending_max: 1000,
			},
		});

		const counter = makeCounter();
		const queryFn = makeQueryFn(counter, 30);
		const tasks = Array.from({ length: 12 }, (_, index) =>
			runWithFullSubjectGate({
				customerId: "cus-clusterwide-single",
				orgId: "org-clusterwide-cus",
				env: AppEnv.Live,
				queryFn: () => queryFn(index),
			}),
		);
		await Promise.all(tasks);
		// 8 cluster-wide / 4 processes = 2 per process
		expect(counter.peak).toBeLessThanOrEqual(2);
		expect(counter.peak).toBeGreaterThan(1);
		expect(counter.current).toBe(0);

		_setFullSubjectGateConfigForTesting({ config: {} });
	});
});
