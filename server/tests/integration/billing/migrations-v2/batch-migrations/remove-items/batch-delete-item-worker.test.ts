import { afterEach, expect, test } from "bun:test";
import { MigrationItemRunStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import {
	expectCustomerEntitlementRowCount,
	expectMigrationItemRunStatus,
} from "../batchTestUtils";

const MESSAGES_INCLUDED = 100;
const MESSAGES_USED = 40;
const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;

afterEach(() => {
	if (previousRollout === undefined)
		delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
});

const setupFreePlanWithUsage = async ({
	customerId,
	planId,
}: {
	customerId: string;
	planId: string;
}) => {
	const plan = products.base({
		id: planId,
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: MESSAGES_INCLUDED }),
		],
	});
	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});
	await scenario.autumnV2_2.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: MESSAGES_USED,
	});
	return { ...scenario, plan };
};

const removeMessagesOperations = ({ planId }: { planId: string }) => ({
	customer: [
		{
			type: "update_plan" as const,
			plan_filter: { plan_id: planId, custom: false },
			customize: { remove_items: [{ feature_id: TestFeature.Messages }] },
		},
	],
});

test(`${chalk.yellowBright("batch migration: a routed customer's remove lands through the worker, so check sees it at once")}`, async () => {
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
	const customerId = "batch-worker-remove-applied";
	const { ctx, autumnV2_2, plan } = await setupFreePlanWithUsage({
		customerId,
		planId: "batch-worker-remove-applied-plan",
	});

	const { result, migration, migrationRunId } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-worker-remove-applied-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: removeMessagesOperations({ planId: plan.id }),
		noBillingChanges: true,
	});

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
		required_balance: 1,
	});
	expect(check.allowed).toBe(false);

	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Messages,
		count: 0,
	});
	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Dashboard,
		count: 1,
	});
});

test(`${chalk.yellowBright("batch migration: an unreachable worker fails a routed customer's item run and writes nothing")}`, async () => {
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
	const customerId = "batch-worker-remove-unreachable";
	const { ctx, autumnV2_2, plan } = await setupFreePlanWithUsage({
		customerId,
		planId: "batch-worker-remove-unreachable-plan",
	});

	const { result, migration, migrationRunId } = await runChunkedMigration({
		ctx: { ...ctx, testOptions: { balanceWorkerOutage: true } },
		migrationClient: autumnV2_2,
		migrationId: "batch-worker-remove-unreachable-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: removeMessagesOperations({ planId: plan.id }),
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");
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
		count: 1,
	});

	const check = await autumnV2_2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: MESSAGES_INCLUDED - MESSAGES_USED,
	});
	expect(check.allowed).toBe(true);
});

test(`${chalk.yellowBright("batch migration: a customer the worker doesn't own keeps the SQL path")}`, async () => {
	const customerId = "batch-worker-remove-sql-lane";
	const { ctx, autumnV2_2, plan } = await setupFreePlanWithUsage({
		customerId,
		planId: "batch-worker-remove-sql-lane-plan",
	});

	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";
	const { result, migration, migrationRunId } = await runChunkedMigration({
		ctx: { ...ctx, testOptions: { balanceWorkerOutage: true } },
		migrationClient: autumnV2_2,
		migrationId: "batch-worker-remove-sql-lane-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: removeMessagesOperations({ planId: plan.id }),
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");
	await expectMigrationItemRunStatus({
		ctx,
		migrationInternalId: migration.internal_id,
		migrationRunId,
		customerId,
		status: MigrationItemRunStatus.Succeeded,
	});
	await expectCustomerEntitlementRowCount({
		ctx,
		customerId,
		planId: plan.id,
		featureId: TestFeature.Messages,
		count: 0,
	});
});
