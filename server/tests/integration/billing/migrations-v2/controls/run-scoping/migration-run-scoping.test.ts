import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	MigrationItemKind,
	MigrationItemRunStatus,
} from "@autumn/shared";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import {
	migrationItemRunRepo,
	migrationRunRepo,
} from "@/internal/migrations/v2/repos/index.js";
import { waitForMigrationResult } from "../../utils/runUpdatePlanMigration.js";

const timeout = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

const uniqueSuffix = () =>
	`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

test.concurrent(
	`${chalk.yellowBright("migration run scoping: only persists target_customer_ids on run record")}`,
	async () => {
		const suffix = uniqueSuffix();
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
	},
);

test.concurrent(
	`${chalk.yellowBright("migration run scoping: retry_item_statuses reruns failed customer rows")}`,
	async () => {
		const suffix = uniqueSuffix();
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
			retry_item_statuses: [MigrationItemRunStatus.Failed],
		});

		await waitForRunCompleted({ ctx, runId: runResponse.run_id });
		const itemRun = await migrationItemRunRepo.getCustomer({
			ctx,
			migrationInternalId: migration.internal_id,
			internalCustomerId,
		});
		expect(itemRun).toMatchObject({ status: MigrationItemRunStatus.Succeeded });
	},
);

test.concurrent(
	`${chalk.yellowBright("migration run scoping: retry_item_statuses reruns skipped customer rows")}`,
	async () => {
		/**
		 * Contract under test:
		 *   New request field:
		 *     - retry_item_statuses?: ("failed" | "skipped")[] on migrations.run.
		 *   New behaviors:
		 *     - A normal rerun continues to checkpoint-exclude skipped item rows.
		 *     - retry_item_statuses: ["skipped"] reselects and reclaims skipped rows.
		 *   Side effects:
		 *     - The reclaimed migration_item_runs row finishes succeeded on the new run.
		 */
		const suffix = uniqueSuffix();
		const customerId = `run-scope-retry-skipped-${suffix}`;
		const attachedPlan = products.base({
			id: `run-scope-retry-skipped-attached-${suffix}`,
			items: [],
		});
		const unmatchedPlan = products.base({
			id: `run-scope-retry-skipped-unmatched-${suffix}`,
			items: [],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer(),
				s.products({ list: [attachedPlan, unmatchedPlan] }),
			],
			actions: [s.billing.attach({ productId: attachedPlan.id })],
		});
		const internalCustomerId = await getInternalCustomerId({ customerId, ctx });

		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `run-scope-retry-skipped-mig-${suffix}`,
			filter: { customer: { plan: { plan_id: attachedPlan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: unmatchedPlan.id },
						customize: { add_items: [itemsV2.dashboard()] },
					},
				],
			},
		});

		const skippedRun = await autumnV2_2.migrationsV2.run({
			id: migration.id,
			dry_run: false,
		});
		await waitForRunCompleted({ ctx, runId: skippedRun.run_id });

		const skippedItemRun = await migrationItemRunRepo.getCustomer({
			ctx,
			migrationInternalId: migration.internal_id,
			internalCustomerId,
		});
		expect(skippedItemRun).toMatchObject({
			status: MigrationItemRunStatus.Skipped,
			migration_run_id: skippedRun.run_id,
		});

		await autumnV2_2.migrationsV2.update({
			id: migration.id,
			updates: {
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: attachedPlan.id },
							customize: { add_items: [itemsV2.dashboard()] },
						},
					],
				},
			},
		});

		const excludedRun = await autumnV2_2.migrationsV2.run({
			id: migration.id,
			dry_run: false,
		});
		await waitForRunCompleted({ ctx, runId: excludedRun.run_id });

		const stillSkippedItemRun = await migrationItemRunRepo.getCustomer({
			ctx,
			migrationInternalId: migration.internal_id,
			internalCustomerId,
		});
		expect(stillSkippedItemRun).toMatchObject({
			status: MigrationItemRunStatus.Skipped,
			migration_run_id: skippedRun.run_id,
		});

		const retryRun = await autumnV2_2.migrationsV2.run({
			id: migration.id,
			dry_run: false,
			retry_item_statuses: [MigrationItemRunStatus.Skipped],
		});
		await waitForRunCompleted({ ctx, runId: retryRun.run_id });

		const retriedItemRun = await migrationItemRunRepo.getCustomer({
			ctx,
			migrationInternalId: migration.internal_id,
			internalCustomerId,
		});
		expect(retriedItemRun).toMatchObject({
			status: MigrationItemRunStatus.Succeeded,
			migration_run_id: retryRun.run_id,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectFlagCorrect({
			customer,
			featureId: TestFeature.Dashboard,
			present: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("migration run scoping: limit caps live lazy sample runs")}`,
	async () => {
		/**
		 * TDD regression for sample-by-count live runs.
		 *
		 * Red-failure mode:
		 *  - migrations.run({ limit, lazy_run: true }) persists target_limit but
		 *    still claims every matching customer in migration_item_runs.
		 *
		 * Green-success criteria:
		 *  - The run record keeps target_limit, and the current run only creates
		 *    item-run rows for the requested limit.
		 */
		const suffix = uniqueSuffix();
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
				s.customer({ testClock: false }),
				s.otherCustomers(
					customerIds.slice(1).map((id) => ({
						id,
						distinctTestClock: true,
					})),
				),
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
			lazy_run: true,
		});

		await waitForMigrationResult({
			timeoutMs: 60_000,
			pollIntervalMs: 1_000,
			waitFor: async () => {
				const counts = await migrationItemRunRepo.getCounts({
					ctx,
					migrationInternalId: migration.internal_id,
					dryRun: false,
					migrationRunId: runResponse.run_id,
				});
				expect(counts.total).toBe(2);
			},
		});
		await timeout(3_000);

		const [run] = await migrationRunRepo.list({
			ctx,
			internalId: runResponse.run_id,
		});
		expect(run).toBeDefined();
		expect(run.only_ids).toBeNull();
		expect(run.target_limit).toBe(2);
		expect(run.lazy_run).toBe(true);

		const counts = await migrationItemRunRepo.getCounts({
			ctx,
			migrationInternalId: migration.internal_id,
			dryRun: false,
			migrationRunId: runResponse.run_id,
		});
		expect(counts.total).toBe(2);
	},
);

test.concurrent(
	`${chalk.yellowBright("migration run scoping: full run has null target fields")}`,
	async () => {
		const suffix = uniqueSuffix();
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
	},
);
