import { afterEach, expect, test } from "bun:test";
import { MigrationItemRunStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import {
	expectCustomerEntitlementRowCount,
	expectMigrationItemRunStatus,
} from "../batchTestUtils";

const MESSAGES_ADDED = 100;
const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;

afterEach(() => {
	if (previousRollout === undefined)
		delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
});

const setupDashboardPlan = async ({ stem }: { stem: string }) => {
	const customerId = `${stem}-customer`;
	const plan = products.base({
		id: `${stem}-plan`,
		items: [itemsV2.dashboard()],
	});
	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});
	await scenario.autumnV2_2.check({
		customer_id: customerId,
		feature_id: TestFeature.Dashboard,
	});
	return { ...scenario, customerId, plan };
};

const addMessagesOperations = ({ planId }: { planId: string }) => ({
	customer: [
		{
			type: "update_plan" as const,
			plan_filter: { plan_id: planId, custom: false },
			customize: {
				add_items: [itemsV2.monthlyMessages({ included: MESSAGES_ADDED })],
			},
		},
	],
});

test(`${chalk.yellowBright("batch migration: a routed customer's add lands through the worker once, even when replayed")}`, async () => {
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
	const stem = "batch-worker-add-applied";
	const { ctx, autumnV2_2, customerId, plan } = await setupDashboardPlan({
		stem,
	});

	const run = (migrationId: string) =>
		runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId,
			filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
			operations: addMessagesOperations({ planId: plan.id }),
			noBillingChanges: true,
		});

	const { result, migration, migrationRunId } = await run(`${stem}-migration`);
	expect(result?.lane).toBe("batch");
	await expectMigrationItemRunStatus({
		ctx,
		migrationInternalId: migration.internal_id,
		migrationRunId,
		customerId,
		status: MigrationItemRunStatus.Succeeded,
	});

	const check = await autumnV2_2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: MESSAGES_ADDED,
	});
	expect(check.allowed).toBe(true);
	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Messages,
		count: 1,
	});

	await run(`${stem}-replay-migration`);
	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Messages,
		count: 1,
	});
});

test(`${chalk.yellowBright("batch migration: an unreachable worker fails a routed customer's add and inserts nothing")}`, async () => {
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
	const stem = "batch-worker-add-unreachable";
	const { ctx, autumnV2_2, customerId, plan } = await setupDashboardPlan({
		stem,
	});

	const { migration, migrationRunId } = await runChunkedMigration({
		ctx: { ...ctx, testOptions: { balanceWorkerOutage: true } },
		migrationClient: autumnV2_2,
		migrationId: `${stem}-migration`,
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: addMessagesOperations({ planId: plan.id }),
		noBillingChanges: true,
	});

	await expectMigrationItemRunStatus({
		ctx,
		migrationInternalId: migration.internal_id,
		migrationRunId,
		customerId,
		status: MigrationItemRunStatus.Failed,
	});
	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Messages,
		count: 0,
	});
});
