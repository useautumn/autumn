// Contract: migrations-v2 run API must be idempotent per migration/customer.
// It must also serialize migration task execution per org.

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ErrCode,
	type Migration,
	MigrationItemKind,
	MigrationItemRunStatus,
	MigrationRunStatus,
	migrationRuns,
} from "@autumn/shared";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import {
	migrationItemRunRepo,
	migrationRunRepo,
} from "@/internal/migrations/v2/repos/index.js";
import { waitForMigrationResult } from "../../utils/runUpdatePlanMigration.js";

const timeout = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

const migrationIdSuffix = Date.now().toString(36);
const uniqueMigrationId = (id: string) => `${id}-${migrationIdSuffix}`;

const buildDashboardMigration = ({
	id,
	planId,
}: {
	id: string;
	planId: string;
}) => ({
	id,
	filter: { customer: { plan: { plan_id: planId } } },
	operations: {
		customer: [
			{
				type: "update_plan" as const,
				plan_filter: { plan_id: planId },
				customize: {
					add_items: [itemsV2.dashboard()],
				},
			},
		],
	},
});

/** The shared test org accumulates live runs whenever trigger-dispatched
 * runs have no local runner; settle them so claim tests start clean. */
const settleActiveOrgRuns = async ({
	ctx,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
}) => {
	await ctx.db
		.update(migrationRuns)
		.set({
			status: MigrationRunStatus.Failed,
			error_message: "settled by migration-idempotency test setup",
			finished_at: Date.now(),
		})
		.where(
			and(
				eq(migrationRuns.org_id, ctx.org.id),
				eq(migrationRuns.env, ctx.env),
				inArray(migrationRuns.status, [
					MigrationRunStatus.Queued,
					MigrationRunStatus.Running,
				]),
			),
		);
};

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

const getCustomerItemRun = ({
	ctx,
	migration,
	internalCustomerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	migration: Migration;
	internalCustomerId: string;
}) =>
	migrationItemRunRepo.getCustomer({
		ctx,
		migrationInternalId: migration.internal_id,
		internalCustomerId,
	});

const waitForCustomerItemRunStatus = async ({
	ctx,
	migration,
	internalCustomerId,
	status,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	migration: Migration;
	internalCustomerId: string;
	status: MigrationItemRunStatus;
}) =>
	waitForMigrationResult({
		timeoutMs: 60_000,
		pollIntervalMs: 1_000,
		waitFor: async () => {
			expect(
				await getCustomerItemRun({
					ctx,
					migration,
					internalCustomerId,
				}),
			).toMatchObject({ status });
		},
	});

const waitForMigrationRunAccepted = async ({
	autumnV2_2,
	id,
	dryRun = false,
	retryItemStatuses,
}: {
	autumnV2_2: Awaited<ReturnType<typeof initScenario>>["autumnV2_2"];
	id: string;
	dryRun?: boolean;
	retryItemStatuses?: ("failed" | "skipped")[];
}) =>
	waitForMigrationResult({
		timeoutMs: 60_000,
		pollIntervalMs: 1_000,
		waitFor: async () =>
			autumnV2_2.migrationsV2.run({
				id,
				dry_run: dryRun,
				retry_item_statuses: retryItemStatuses,
			}),
	});

test(`${chalk.yellowBright("migrations idempotency: run API does not replay a succeeded customer")}`, async () => {
	const customerId = "migration-idem-succeeded";
	const plan = products.pro({ items: [] });
	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const internalCustomerId = await getInternalCustomerId({ customerId, ctx });
	const migration = await autumnV2_2.migrationsV2.deleteAndCreate(
		buildDashboardMigration({
			id: uniqueMigrationId(`${customerId}-mig`),
			planId: plan.id,
		}),
	);

	await waitForMigrationRunAccepted({ autumnV2_2, id: migration.id });
	await waitForCustomerItemRunStatus({
		ctx,
		migration,
		internalCustomerId,
		status: MigrationItemRunStatus.Succeeded,
	});
	const firstRun = await getCustomerItemRun({
		ctx,
		migration,
		internalCustomerId,
	});
	expect(firstRun).toMatchObject({
		status: MigrationItemRunStatus.Succeeded,
	});

	await waitForMigrationRunAccepted({ autumnV2_2, id: migration.id });
	await timeout(3_000);
	const secondRun = await getCustomerItemRun({
		ctx,
		migration,
		internalCustomerId,
	});
	expect(secondRun).toMatchObject({
		status: MigrationItemRunStatus.Succeeded,
		updated_at: firstRun?.updated_at,
	});

	const otherMigration = await autumnV2_2.migrationsV2.deleteAndCreate(
		buildDashboardMigration({
			id: uniqueMigrationId(`${customerId}-other-mig`),
			planId: plan.id,
		}),
	);
	await waitForMigrationRunAccepted({ autumnV2_2, id: otherMigration.id });
	await waitForCustomerItemRunStatus({
		ctx,
		migration: otherMigration,
		internalCustomerId,
		status: MigrationItemRunStatus.Skipped,
	});
});

test(`${chalk.yellowBright("migrations idempotency: run API skips running and failed customer rows")}`, async () => {
	const customerId = "migration-idem-skips";
	const plan = products.pro({ items: [] });
	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const internalCustomerId = await getInternalCustomerId({ customerId, ctx });

	const runningMigration = await autumnV2_2.migrationsV2.deleteAndCreate(
		buildDashboardMigration({
			id: uniqueMigrationId(`${customerId}-running-mig`),
			planId: plan.id,
		}),
	);
	await migrationItemRunRepo.claim({
		ctx,
		migrationInternalId: runningMigration.internal_id,
		itemKind: MigrationItemKind.Customer,
		itemId: internalCustomerId,
		claimBehavior: "claim_new",
	});
	await waitForMigrationRunAccepted({ autumnV2_2, id: runningMigration.id });
	await timeout(3_000);
	expect(
		await getCustomerItemRun({
			ctx,
			migration: runningMigration,
			internalCustomerId,
		}),
	).toMatchObject({ status: MigrationItemRunStatus.Running });

	const failedMigration = await autumnV2_2.migrationsV2.deleteAndCreate(
		buildDashboardMigration({
			id: uniqueMigrationId(`${customerId}-failed-mig`),
			planId: plan.id,
		}),
	);
	await migrationItemRunRepo.claim({
		ctx,
		migrationInternalId: failedMigration.internal_id,
		itemKind: MigrationItemKind.Customer,
		itemId: internalCustomerId,
		claimBehavior: "claim_new",
	});
	await migrationItemRunRepo.markFailed({
		ctx,
		migrationInternalId: failedMigration.internal_id,
		itemKind: MigrationItemKind.Customer,
		itemId: internalCustomerId,
	});
	await waitForMigrationRunAccepted({ autumnV2_2, id: failedMigration.id });
	await timeout(3_000);
	expect(
		await getCustomerItemRun({
			ctx,
			migration: failedMigration,
			internalCustomerId,
		}),
	).toMatchObject({ status: MigrationItemRunStatus.Failed });

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		present: false,
	});
});

test(`${chalk.yellowBright("migrations idempotency: retry_item_statuses and dry_run are honored through run API")}`, async () => {
	const retryCustomerId = "migration-idem-retry";
	const dryRunCustomerId = "migration-idem-dry-run";
	const retryPlan = products.pro({ id: "retry-pro", items: [] });
	const dryRunPlan = products.premium({ id: "dry-run-premium", items: [] });
	const { autumnV2_2, ctx } = await initScenario({
		customerId: retryCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: dryRunCustomerId, paymentMethod: "success" }]),
			s.products({ list: [retryPlan, dryRunPlan] }),
		],
		actions: [
			s.billing.attach({ productId: retryPlan.id }),
			s.billing.attach({
				customerId: dryRunCustomerId,
				productId: dryRunPlan.id,
			}),
		],
	});
	const retryInternalCustomerId = await getInternalCustomerId({
		customerId: retryCustomerId,
		ctx,
	});
	const dryRunInternalCustomerId = await getInternalCustomerId({
		customerId: dryRunCustomerId,
		ctx,
	});

	const retryMigration = await autumnV2_2.migrationsV2.deleteAndCreate(
		buildDashboardMigration({
			id: uniqueMigrationId(`${retryCustomerId}-mig`),
			planId: retryPlan.id,
		}),
	);
	await migrationItemRunRepo.claim({
		ctx,
		migrationInternalId: retryMigration.internal_id,
		itemKind: MigrationItemKind.Customer,
		itemId: retryInternalCustomerId,
		claimBehavior: "claim_new",
	});
	await migrationItemRunRepo.markFailed({
		ctx,
		migrationInternalId: retryMigration.internal_id,
		itemKind: MigrationItemKind.Customer,
		itemId: retryInternalCustomerId,
	});
	await waitForMigrationRunAccepted({
		autumnV2_2,
		id: retryMigration.id,
		retryItemStatuses: [MigrationItemRunStatus.Failed],
	});
	await waitForCustomerItemRunStatus({
		ctx,
		migration: retryMigration,
		internalCustomerId: retryInternalCustomerId,
		status: MigrationItemRunStatus.Succeeded,
	});
	expect(
		await getCustomerItemRun({
			ctx,
			migration: retryMigration,
			internalCustomerId: retryInternalCustomerId,
		}),
	).toMatchObject({ status: MigrationItemRunStatus.Succeeded });

	const dryRunMigration = await autumnV2_2.migrationsV2.deleteAndCreate(
		buildDashboardMigration({
			id: uniqueMigrationId(`${dryRunCustomerId}-mig`),
			planId: dryRunPlan.id,
		}),
	);
	await waitForMigrationRunAccepted({
		autumnV2_2,
		id: dryRunMigration.id,
		dryRun: true,
	});
	await timeout(3_000);
	expect(
		await getCustomerItemRun({
			ctx,
			migration: dryRunMigration,
			internalCustomerId: dryRunInternalCustomerId,
		}),
	).toBeNull();
	const dryRunCustomer =
		await autumnV2_2.customers.get<ApiCustomerV5>(dryRunCustomerId);
	expectFlagCorrect({
		customer: dryRunCustomer,
		featureId: TestFeature.Dashboard,
		present: false,
	});
});

test(`${chalk.yellowBright("migrations idempotency: item run checkpoints are dry-run scoped")}`, async () => {
	const customerId = "migration-idem-dry-run-scope";
	const plan = products.pro({ items: [] });
	const { ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const internalCustomerId = await getInternalCustomerId({ customerId, ctx });
	const migrationInternalId = "script_test_dry_run_scope";

	await migrationItemRunRepo.claim({
		ctx,
		migrationInternalId,
		migrationRunId: "dry-run-v1",
		dryRun: true,
		itemKind: MigrationItemKind.Customer,
		itemId: internalCustomerId,
		claimBehavior: "claim_new",
	});
	await migrationItemRunRepo.markSucceeded({
		ctx,
		migrationInternalId,
		migrationRunId: "dry-run-v1",
		dryRun: true,
		itemKind: MigrationItemKind.Customer,
		itemId: internalCustomerId,
	});

	expect(
		await migrationItemRunRepo.getCustomer({
			ctx,
			migrationInternalId,
			migrationRunId: "dry-run-v1",
			dryRun: true,
			internalCustomerId,
		}),
	).toMatchObject({ status: MigrationItemRunStatus.Succeeded });
	expect(
		await migrationItemRunRepo.getCustomer({
			ctx,
			migrationInternalId,
			migrationRunId: "dry-run-v2",
			dryRun: true,
			internalCustomerId,
		}),
	).toBeNull();

	const manualReplayMigrationInternalId = "script_test_manual_replay";
	await migrationItemRunRepo.markSucceeded({
		ctx,
		migrationInternalId: manualReplayMigrationInternalId,
		itemKind: MigrationItemKind.Customer,
		itemId: internalCustomerId,
	});
	expect(
		await migrationItemRunRepo.getCustomer({
			ctx,
			migrationInternalId: manualReplayMigrationInternalId,
			internalCustomerId,
		}),
	).toMatchObject({
		dry_run: false,
		status: MigrationItemRunStatus.Succeeded,
	});

	await expect(
		migrationItemRunRepo.claim({
			ctx,
			migrationInternalId,
			itemKind: MigrationItemKind.Customer,
			itemId: internalCustomerId,
			claimBehavior: "claim_new",
		}),
	).resolves.toMatchObject({ claimed: true });
});

test(`${chalk.yellowBright("migrations idempotency: run API rejects a second active run for the same migration")}`, async () => {
	const customerId = "migration-idem-active-run";
	const plan = products.pro({ id: "active-run-pro", items: [] });
	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const migration = await autumnV2_2.migrationsV2.deleteAndCreate(
		buildDashboardMigration({
			id: uniqueMigrationId(`${customerId}-mig`),
			planId: plan.id,
		}),
	);
	await settleActiveOrgRuns({ ctx });
	const activeRun = await migrationRunRepo.insert({
		ctx,
		insert: {
			migration_internal_id: migration.internal_id,
			dry_run: false,
			lazy_run: false,
			only_ids: null,
			target_limit: undefined,
		},
	});
	expect(activeRun).not.toBeNull();

	try {
		await expect(
			autumnV2_2.migrationsV2.run({
				id: migration.id,
				dry_run: false,
			}),
		).rejects.toMatchObject({
			code: ErrCode.MigrationAlreadyInProgress,
			message: expect.stringContaining("already running"),
		});
	} finally {
		if (activeRun) {
			await migrationRunRepo.update({
				ctx,
				internalId: activeRun.internal_id,
				updates: {
					status: MigrationRunStatus.Succeeded,
					finished_at: Date.now(),
				},
			});
		}
	}
});

test(`${chalk.yellowBright("migrations idempotency: a second migration in the same org is accepted and queues behind the first")}`, async () => {
	const customerId = "migration-idem-org-queued-run";
	const plan = products.pro({ id: "org-queued-run-pro", items: [] });
	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const blockingMigration = await autumnV2_2.migrationsV2.deleteAndCreate(
		buildDashboardMigration({
			id: uniqueMigrationId(`${customerId}-mig-a`),
			planId: plan.id,
		}),
	);
	const otherMigration = await autumnV2_2.migrationsV2.deleteAndCreate(
		buildDashboardMigration({
			id: uniqueMigrationId(`${customerId}-mig-b`),
			planId: plan.id,
		}),
	);
	await settleActiveOrgRuns({ ctx });
	const activeRun = await migrationRunRepo.insert({
		ctx,
		insert: {
			migration_internal_id: blockingMigration.internal_id,
			dry_run: false,
			lazy_run: false,
			only_ids: null,
			target_limit: undefined,
		},
	});
	expect(activeRun).not.toBeNull();
	if (!activeRun) throw new Error("expected the blocking run to claim");

	let otherRunId: string | undefined;
	try {
		// Org-level ordering is trigger's job (migrationRunQueue +
		// per-(org, env) concurrencyKey), so the API ACCEPTS a different
		// migration while one is live — no 409, no unique-index conflict.
		const response = await autumnV2_2.migrationsV2.run({
			id: otherMigration.id,
			dry_run: false,
		});
		otherRunId = response.run_id;
		expect(otherRunId).toBeTruthy();

		// Both live rows coexist for the org — the DB no longer forbids it
		// (trigger's per-(org, env) concurrencyKey does the actual ordering).
		const liveRuns = await ctx.db
			.select({ internal_id: migrationRuns.internal_id })
			.from(migrationRuns)
			.where(
				and(
					eq(migrationRuns.org_id, ctx.org.id),
					eq(migrationRuns.env, ctx.env),
					inArray(migrationRuns.status, [
						MigrationRunStatus.Queued,
						MigrationRunStatus.Running,
					]),
				),
			);
		expect(liveRuns.map((run) => run.internal_id).sort()).toEqual(
			[activeRun.internal_id, response.run_id].sort(),
		);
	} finally {
		for (const internalId of [activeRun.internal_id, otherRunId]) {
			if (!internalId) continue;
			await migrationRunRepo.update({
				ctx,
				internalId,
				updates: {
					status: MigrationRunStatus.Succeeded,
					finished_at: Date.now(),
				},
			});
		}
	}
});
