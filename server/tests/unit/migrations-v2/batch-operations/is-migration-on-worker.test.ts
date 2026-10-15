import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isMigrationOnWorker } from "@/internal/migrations/v2/batchOperations/execute/isMigrationOnWorker.js";
import type {
	BatchMigrationExecutionPatch,
	BatchMigrationExecutionPlan,
} from "@/internal/migrations/v2/batchOperations/types/index.js";
import { _setRolloutConfigForTesting } from "@/internal/misc/rollouts/rolloutConfigStore.js";
import { ACTIVE_ROLLOUT_ID } from "@/internal/misc/rollouts/rolloutUtils.js";

const ORG_ID = "org_migration_switch";
const ctx = {
	org: { id: ORG_ID, is_sandbox: false, created_by: null },
} as unknown as Pick<AutumnContext, "org">;

const setOrgPercent = ({ percent }: { percent: number }) =>
	_setRolloutConfigForTesting({
		config: {
			rollouts: {
				[ACTIVE_ROLLOUT_ID]: {
					orgs: {
						[ORG_ID]: { percent, previousPercent: percent, changedAt: 0 },
					},
				},
			},
		},
	});

const removesOnly = {
	removeEntitlementOps: [{ from: {} }],
	replaceEntitlementOps: [],
	addEntitlementOps: [],
	licenseEntitlementOps: [],
};

const planOf = (
	...patches: Partial<BatchMigrationExecutionPatch>[]
): BatchMigrationExecutionPlan =>
	({
		patches: patches.map((patch) => ({ ...removesOnly, ...patch })),
	}) as unknown as BatchMigrationExecutionPlan;

describe("isMigrationOnWorker", () => {
	const previousOverride = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	beforeAll(() => {
		process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "config";
	});
	afterAll(() => {
		if (previousOverride === undefined)
			delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
		else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousOverride;
		_setRolloutConfigForTesting({ config: { rollouts: {} } });
	});

	test("a removes-only migration of an org at 100% runs on the worker", () => {
		setOrgPercent({ percent: 100 });
		expect(isMigrationOnWorker({ ctx, plan: planOf({}, {}) })).toBe(true);
	});

	test("an org below 100% keeps the SQL path, even at 99%", () => {
		setOrgPercent({ percent: 99 });
		expect(isMigrationOnWorker({ ctx, plan: planOf({}) })).toBe(false);
	});

	test("one patch with a license op keeps the whole migration on SQL", () => {
		setOrgPercent({ percent: 100 });
		const plan = planOf(
			{},
			{
				licenseEntitlementOps: [
					{ type: "remove_license_entitlement" },
				] as unknown as BatchMigrationExecutionPatch["licenseEntitlementOps"],
			},
		);
		expect(isMigrationOnWorker({ ctx, plan })).toBe(false);
	});

	test("replaces, adds and repoints keep the SQL path until their worker phase lands", () => {
		setOrgPercent({ percent: 100 });
		const pending: Partial<BatchMigrationExecutionPatch>[] = [
			{ replaceEntitlementOps: [{}] as never },
			{ addEntitlementOps: [{}] as never },
			{ repointCustomerProduct: { toInternalProductId: "prod_v2" } as never },
		];
		expect(
			pending.map((patch) => isMigrationOnWorker({ ctx, plan: planOf(patch) })),
		).toEqual([false, false, false]);
	});
});
