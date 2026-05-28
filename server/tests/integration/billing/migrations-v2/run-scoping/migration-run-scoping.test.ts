import { expect, test } from "bun:test";
import { MigrationItemKind, MigrationItemRunStatus } from "@autumn/shared";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import {
	migrationRunRepo,
	migrationItemRunRepo,
	migrationRepo,
} from "@/internal/migrations/v2/repos/index.js";
import { waitForMigrationResult } from "../utils/runUpdatePlanMigration.js";

const timeout = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

const getInternalCustomerId = async ({
	customerId,
	ctx,
}: {
	customerId: string;
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
}) => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	if (!customer) throw new Error(`Expected customer ${customerId}`);
	return customer.internal_id;
};

const waitForRunCompleted = async ({
	ctx,
	runId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	runId: string;
}) =>
	waitForMigrationResult({
		timeoutMs: 60_000,
		pollIntervalMs: 1_000,
		waitFor: async () => {
			const [run] = await migrationRunRepo.list({
				ctx,
				internalId: runId,
			});
			if (!run) throw new Error("Run not found");
			if (run.status !== "succeeded" && run.status !== "failed")
				throw new Error(`Run still ${run.status}`);
		},
	});

test(`${chalk.yellowBright("migration run scoping: only persists target_customer_ids on run record")}`, async () => {
	const suffix = Date.now();
	const firstId = `run-scope-only-first-${suffix}`;
	const secondId = `run-scope-only-second-${suffix}`;
	const plan = products.base({
		id: `run-scope-only-plan-${suffix}`,
		items: [],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId: firstId,
		setup: [
			s.customer(),
			s.otherCustomers([{ id: secondId }]),
			s.products({ list: [plan] }),
		],
		actions: [
			s.parallel(
				s.billing.attach({ productId: plan.id }),
				s.billing.attach({ customerId: secondId, productId: plan.id }),
			),
		],
	});

	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `run-scope-only-mig-${suffix}`,
		filter: { customer: { plan: { plan_id: plan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id },
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		},
	});

	const runResponse = await autumnV2_2.migrationsV2.run({
		id: migration.id,
		dry_run: true,
		only: [firstId],
	});

	await waitForRunCompleted({ ctx, runId: runResponse.run_id });

	const [run] = await migrationRunRepo.list({
		ctx,
		internalId: runResponse.run_id,
	});
	expect(run).toBeDefined();
	expect(run.only_ids).toEqual([firstId]);
	expect(run.target_limit).toBeNull();
	expect(run.dry_run).toBe(true);

	const firstInternalId = await getInternalCustomerId({
		customerId: firstId,
		ctx,
	});
	const secondInternalId = await getInternalCustomerId({
		customerId: secondId,
		ctx,
	});

	const firstItemRun = await migrationItemRunRepo.getCustomer({
		ctx,
		migrationInternalId: migration.internal_id,
		internalCustomerId: firstInternalId,
		dryRun: true,
		migrationRunId: runResponse.run_id,
	});
	expect(firstItemRun).toMatchObject({
		status: MigrationItemRunStatus.Succeeded,
	});

	const secondItemRun = await migrationItemRunRepo.getCustomer({
		ctx,
		migrationInternalId: migration.internal_id,
		internalCustomerId: secondInternalId,
		dryRun: true,
		migrationRunId: runResponse.run_id,
	});
	expect(secondItemRun).toBeNull();
});

test(`${chalk.yellowBright("migration run scoping: retry_failed request overrides migration default")}`, async () => {
	const suffix = Date.now();
	const customerId = `run-scope-retry-only-${suffix}`;
	const plan = products.base({
		id: `run-scope-retry-only-plan-${suffix}`,
		items: [],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const internalCustomerId = await getInternalCustomerId({ customerId, ctx });

	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `run-scope-retry-only-mig-${suffix}`,
		filter: { customer: { plan: { plan_id: plan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id },
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		},
	});
	expect(migration.retry_failed).toBe(false);

	await migrationItemRunRepo.claim({
		ctx,
		migrationInternalId: migration.internal_id,
		itemKind: MigrationItemKind.Customer,
		itemId: internalCustomerId,
		claimBehavior: "claim_new",
	});
	await migrationItemRunRepo.markFailed({
		ctx,
		migrationInternalId: migration.internal_id,
		itemKind: MigrationItemKind.Customer,
		itemId: internalCustomerId,
	});

	const runResponse = await autumnV2_2.migrationsV2.run({
		id: migration.id,
		dry_run: false,
		only: [customerId],
		retry_failed: true,
	});

	await waitForRunCompleted({ ctx, runId: runResponse.run_id });
	const itemRun = await migrationItemRunRepo.getCustomer({
		ctx,
		migrationInternalId: migration.internal_id,
		internalCustomerId,
	});
	expect(itemRun).toMatchObject({ status: MigrationItemRunStatus.Succeeded });

	const unchangedMigration = await migrationRepo.find({ ctx, id: migration.id });
	expect(unchangedMigration.retry_failed).toBe(false);
});

test(`${chalk.yellowBright("migration run scoping: limit persists target_limit on run record")}`, async () => {
	const suffix = Date.now();
	const customerIds = Array.from(
		{ length: 5 },
		(_, i) => `run-scope-limit-${i}-${suffix}`,
	);
	const plan = products.base({
		id: `run-scope-limit-plan-${suffix}`,
		items: [],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId: customerIds[0],
		setup: [
			s.customer(),
			s.otherCustomers(customerIds.slice(1).map((id) => ({ id }))),
			s.products({ list: [plan] }),
		],
		actions: [
			s.parallel(
				...customerIds.map((id) =>
					id === customerIds[0]
						? s.billing.attach({ productId: plan.id })
						: s.billing.attach({ customerId: id, productId: plan.id }),
				),
			),
		],
	});

	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `run-scope-limit-mig-${suffix}`,
		filter: { customer: { plan: { plan_id: plan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id },
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		},
	});

	const runResponse = await autumnV2_2.migrationsV2.run({
		id: migration.id,
		dry_run: false,
		limit: 2,
	});

	await waitForRunCompleted({ ctx, runId: runResponse.run_id });

	const [run] = await migrationRunRepo.list({
		ctx,
		internalId: runResponse.run_id,
	});
	expect(run).toBeDefined();
	expect(run.only_ids).toBeNull();
	expect(run.target_limit).toBe(2);

	const events = await autumnV2_2.migrationsV2.listItemEvents({
		migrationId: migration.id,
		migrationRunId: runResponse.run_id,
	});
	expect(events.list.length).toBe(2);
});

test(`${chalk.yellowBright("migration run scoping: full run has null target fields")}`, async () => {
	const suffix = Date.now();
	const customerId = `run-scope-full-${suffix}`;
	const plan = products.base({
		id: `run-scope-full-plan-${suffix}`,
		items: [],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `run-scope-full-mig-${suffix}`,
		filter: { customer: { plan: { plan_id: plan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id },
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		},
	});

	const runResponse = await autumnV2_2.migrationsV2.run({
		id: migration.id,
		dry_run: false,
	});

	await waitForRunCompleted({ ctx, runId: runResponse.run_id });

	const [run] = await migrationRunRepo.list({
		ctx,
		internalId: runResponse.run_id,
	});
	expect(run).toBeDefined();
	expect(run.only_ids).toBeNull();
	expect(run.target_limit).toBeNull();
});
