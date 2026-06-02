// Contract: migrations-v2 run API must be idempotent per migration/customer.
// It must also serialize migration task execution per org.

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ErrCode,
	type Migration,
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
import { migrationItemRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { waitForMigrationResult } from "../utils/runUpdatePlanMigration.js";

const timeout = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

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
			id: `${customerId}-mig`,
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
			id: `${customerId}-other-mig`,
			planId: plan.id,
		}),
	);
	await waitForMigrationRunAccepted({ autumnV2_2, id: otherMigration.id });
	await waitForCustomerItemRunStatus({
		ctx,
		migration: otherMigration,
		internalCustomerId,
		status: MigrationItemRunStatus.Succeeded,
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
			id: `${customerId}-running-mig`,
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
			id: `${customerId}-failed-mig`,
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
			id: `${retryCustomerId}-mig`,
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
			id: `${dryRunCustomerId}-mig`,
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

test(`${chalk.yellowBright("migrations idempotency: run API rejects concurrent migration runs per org")}`, async () => {
	const firstCustomerId = "migration-idem-serial-first";
	const secondCustomerId = "migration-idem-serial-second";
	const firstPlan = products.pro({ id: "serial-pro", items: [] });
	const secondPlan = products.premium({ id: "serial-premium", items: [] });
	const { autumnV2_2, ctx } = await initScenario({
		customerId: firstCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: secondCustomerId, paymentMethod: "success" }]),
			s.products({ list: [firstPlan, secondPlan] }),
		],
		actions: [
			s.billing.attach({ productId: firstPlan.id }),
			s.billing.attach({
				customerId: secondCustomerId,
				productId: secondPlan.id,
			}),
		],
	});
	const firstMigration = await autumnV2_2.migrationsV2.deleteAndCreate(
		buildDashboardMigration({
			id: `${firstCustomerId}-mig`,
			planId: firstPlan.id,
		}),
	);
	const secondMigration = await autumnV2_2.migrationsV2.deleteAndCreate(
		buildDashboardMigration({
			id: `${secondCustomerId}-mig`,
			planId: secondPlan.id,
		}),
	);

	await autumnV2_2.migrationsV2.run({
		id: firstMigration.id,
		dry_run: false,
	});
	await expect(
		autumnV2_2.migrationsV2.run({
			id: secondMigration.id,
			dry_run: false,
		}),
	).rejects.toMatchObject({
		code: ErrCode.MigrationAlreadyInProgress,
		message: expect.stringContaining("already running"),
	});

	const firstInternalCustomerId = await getInternalCustomerId({
		customerId: firstCustomerId,
		ctx,
	});
	const secondInternalCustomerId = await getInternalCustomerId({
		customerId: secondCustomerId,
		ctx,
	});
	await waitForCustomerItemRunStatus({
		ctx,
		migration: firstMigration,
		internalCustomerId: firstInternalCustomerId,
		status: MigrationItemRunStatus.Succeeded,
	});

	await waitForMigrationRunAccepted({ autumnV2_2, id: secondMigration.id });
	await waitForCustomerItemRunStatus({
		ctx,
		migration: secondMigration,
		internalCustomerId: secondInternalCustomerId,
		status: MigrationItemRunStatus.Succeeded,
	});
	const firstItemRun = await getCustomerItemRun({
		ctx,
		migration: firstMigration,
		internalCustomerId: firstInternalCustomerId,
	});
	const secondItemRun = await getCustomerItemRun({
		ctx,
		migration: secondMigration,
		internalCustomerId: secondInternalCustomerId,
	});
	expect(firstItemRun).toMatchObject({
		status: MigrationItemRunStatus.Succeeded,
	});
	expect(secondItemRun).toMatchObject({
		status: MigrationItemRunStatus.Succeeded,
	});
});
