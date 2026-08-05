import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	_setFullSubjectGateEwmaForTesting,
	runWithFullSubjectGate,
} from "@/internal/customers/repos/getFullSubject/getFullSubjectGate.js";
import { _setFullSubjectGateConfigForTesting } from "@/internal/misc/edgeConfigs/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js";

const REPLICA_LANE_WIDE_OPEN = {
	per_customer_limit: 100,
	per_org_limit: 100,
	per_customer_pending_max: 1_000,
	per_org_pending_max: 1_000,
};

beforeAll(() => {
	_setFullSubjectGateEwmaForTesting(100);
});

afterAll(() => {
	_setFullSubjectGateConfigForTesting({ config: {} });
	_setFullSubjectGateEwmaForTesting(100);
});

describe("full subject gate lanes", () => {
	test("a saturated replica lane does not block primary-lane admission for the same customer", async () => {
		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 10,
				per_org_limit: 10,
				max_wait_ms: 60_000,
				per_customer_pending_max: 1_000,
				per_org_pending_max: 1_000,
				replica_lane: {
					per_customer_limit: 1,
					per_org_limit: 1,
					per_customer_pending_max: 2,
					per_org_pending_max: 2,
				},
			},
		});

		const orgId = "org-lane-isolation";
		const customerId = "cus-lane-isolation";
		const hold = () => new Promise((resolve) => setTimeout(resolve, 200));

		// 1 running + 2 pending fills the replica lane; the rest must 429.
		const replicaTasks = Promise.allSettled(
			Array.from({ length: 8 }, () =>
				runWithFullSubjectGate({
					customerId,
					orgId,
					env: AppEnv.Live,
					lane: "replica",
					queryFn: hold,
				}),
			),
		);
		await new Promise((resolve) => setTimeout(resolve, 20));

		const start = Date.now();
		const primaryResult = await runWithFullSubjectGate({
			customerId,
			orgId,
			env: AppEnv.Live,
			lane: "primary",
			queryFn: async () => "primary-ok",
		});
		const primaryElapsedMs = Date.now() - start;

		expect(primaryResult).toBe("primary-ok");
		// Admitted immediately — never queued behind the saturated replica lane.
		expect(primaryElapsedMs).toBeLessThan(100);

		const replicaResults = await replicaTasks;
		const rejected = replicaResults.filter((r) => r.status === "rejected");
		expect(rejected.length).toBeGreaterThan(0);
		for (const r of rejected as PromiseRejectedResult[]) {
			expect(r.reason.statusCode).toBe(429);
			expect(r.reason.code).toBe("rate_limit_exceeded");
		}
	});

	test("the replica lane runs on the replica_lane budgets, not the primary numbers", async () => {
		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 1,
				per_org_limit: 1,
				max_wait_ms: 60_000,
				per_customer_pending_max: 1_000,
				per_org_pending_max: 1_000,
				replica_lane: {
					per_customer_limit: 3,
					per_org_limit: 3,
					per_customer_pending_max: 1_000,
					per_org_pending_max: 1_000,
				},
			},
		});

		let current = 0;
		let peak = 0;
		const tracked = async () => {
			current += 1;
			peak = Math.max(peak, current);
			await new Promise((resolve) => setTimeout(resolve, 30));
			current -= 1;
		};

		await Promise.all(
			Array.from({ length: 9 }, () =>
				runWithFullSubjectGate({
					customerId: "cus-replica-budget",
					orgId: "org-replica-budget",
					env: AppEnv.Live,
					lane: "replica",
					queryFn: tracked,
				}),
			),
		);

		expect(peak).toBeLessThanOrEqual(3);
		expect(peak).toBeGreaterThan(1);
		expect(current).toBe(0);
	});

	test("a saturated primary lane does not block replica-lane admission", async () => {
		_setFullSubjectGateConfigForTesting({
			config: {
				per_customer_limit: 1,
				per_org_limit: 1,
				max_wait_ms: 60_000,
				per_customer_pending_max: 2,
				per_org_pending_max: 2,
				replica_lane: REPLICA_LANE_WIDE_OPEN,
			},
		});

		const orgId = "org-lane-isolation-rev";
		const customerId = "cus-lane-isolation-rev";
		const hold = () => new Promise((resolve) => setTimeout(resolve, 200));

		const primaryTasks = Promise.allSettled(
			Array.from({ length: 8 }, () =>
				runWithFullSubjectGate({
					customerId,
					orgId,
					env: AppEnv.Live,
					lane: "primary",
					queryFn: hold,
				}),
			),
		);
		await new Promise((resolve) => setTimeout(resolve, 20));

		const start = Date.now();
		const replicaResult = await runWithFullSubjectGate({
			customerId,
			orgId,
			env: AppEnv.Live,
			lane: "replica",
			queryFn: async () => "replica-ok",
		});
		expect(replicaResult).toBe("replica-ok");
		expect(Date.now() - start).toBeLessThan(100);

		await primaryTasks;
	});
});
