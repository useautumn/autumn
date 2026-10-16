import { afterEach, expect, test } from "bun:test";
import { MigrationItemRunStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import { expectMigrationItemRunStatus } from "../batchTestUtils";
import { readScopedFeatureRow } from "../paidRowTestUtils";

const MESSAGES_INCLUDED = 100;
const NEW_MESSAGES_INCLUDED = 200;
const MESSAGES_USED = 60;
const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;

afterEach(() => {
	if (previousRollout === undefined)
		delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
});

const setupFreePlanWithUsage = async ({ stem }: { stem: string }) => {
	const customerId = `${stem}-customer`;
	const plan = products.base({
		id: `${stem}-plan`,
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
	return { ...scenario, customerId, plan };
};

const replaceMessagesOperations = ({ planId }: { planId: string }) => ({
	customer: [
		{
			type: "update_plan" as const,
			plan_filter: { plan_id: planId, custom: false },
			customize: {
				add_items: [
					itemsV2.monthlyMessages({ included: NEW_MESSAGES_INCLUDED }),
				],
				remove_items: [{ feature_id: TestFeature.Messages }],
			},
		},
	],
});

test(`${chalk.yellowBright("batch migration: a routed customer's replace carries usage through the worker, so check sees the new allowance at once")}`, async () => {
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
	const { ctx, autumnV2_2, customerId, plan } = await setupFreePlanWithUsage({
		stem: "batch-worker-replace-applied",
	});
	const before = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const { result, migration, migrationRunId } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-worker-replace-applied-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: replaceMessagesOperations({ planId: plan.id }),
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

	const remaining = NEW_MESSAGES_INCLUDED - MESSAGES_USED;
	const atRemaining = await autumnV2_2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: remaining,
	});
	expect(atRemaining.allowed).toBe(true);
	const pastRemaining = await autumnV2_2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: remaining + 1,
	});
	expect(pastRemaining.allowed).toBe(false);

	const after = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(after.id).toBe(before.id);
	expect(after.entitlement_id).not.toBe(before.entitlement_id);
	expect(after.balance).toBe(remaining);
});

test(`${chalk.yellowBright("batch migration: an unreachable worker fails a routed customer's replace and leaves the grant as it was")}`, async () => {
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
	const { ctx, autumnV2_2, customerId, plan } = await setupFreePlanWithUsage({
		stem: "batch-worker-replace-unreachable",
	});
	const before = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	const { migration, migrationRunId } = await runChunkedMigration({
		ctx: { ...ctx, testOptions: { balanceWorkerOutage: true } },
		migrationClient: autumnV2_2,
		migrationId: "batch-worker-replace-unreachable-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: replaceMessagesOperations({ planId: plan.id }),
		noBillingChanges: true,
	});

	await expectMigrationItemRunStatus({
		ctx,
		migrationInternalId: migration.internal_id,
		migrationRunId,
		customerId,
		status: MigrationItemRunStatus.Failed,
	});
	const after = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(after.entitlement_id).toBe(before.entitlement_id);

	const pastOldRemaining = await autumnV2_2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: MESSAGES_INCLUDED - MESSAGES_USED + 1,
	});
	expect(pastOldRemaining.allowed).toBe(false);
});
