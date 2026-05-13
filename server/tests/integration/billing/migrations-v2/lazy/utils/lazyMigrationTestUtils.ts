import { expect } from "bun:test";
import {
	type ApiCustomerV5,
	type Migration,
	MigrationItemKind,
	type MigrationItemRun,
	MigrationItemRunStatus,
	migrationRuns,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import { and, eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { finishLazyMigrationRun } from "@/internal/migrations/v2/actions/migrationRun/finishLazyMigrationRun.js";
import { migrationItemRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { waitForMigrationResult } from "../../utils/runUpdatePlanMigration.js";

type ScenarioCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];
type AutumnV2_2 = Awaited<ReturnType<typeof initScenario>>["autumnV2_2"];

/** Boilerplate dashboard migration — adds the `TestFeature.Dashboard` boolean
 *  feature to every customer matching the given plan filter. */
export const buildDashboardLazyMigration = ({
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

export const getInternalCustomerId = async ({
	customerId,
	ctx,
}: {
	customerId: string;
	ctx: ScenarioCtx;
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

export const getCustomerItemRun = ({
	ctx,
	migration,
	internalCustomerId,
}: {
	ctx: ScenarioCtx;
	migration: Migration;
	internalCustomerId: string;
}) =>
	migrationItemRunRepo.getCustomer({
		ctx,
		migrationInternalId: migration.internal_id,
		internalCustomerId,
	});

export const waitForCustomerItemRunStatus = async ({
	ctx,
	migration,
	internalCustomerId,
	status,
	timeoutMs = 60_000,
	pollIntervalMs = 1_000,
}: {
	ctx: ScenarioCtx;
	migration: Migration;
	internalCustomerId: string;
	status: MigrationItemRunStatus;
	timeoutMs?: number;
	pollIntervalMs?: number;
}) =>
	waitForMigrationResult({
		timeoutMs,
		pollIntervalMs,
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

/** Count `migration_item_runs` rows for a given (migration, customer). The
 *  partial unique index `migration_item_runs_live_unique` guarantees at most
 *  one row, so this should always be 0 or 1. */
export const countCustomerItemRunRows = async ({
	ctx,
	migration,
	internalCustomerId,
}: {
	ctx: ScenarioCtx;
	migration: Migration;
	internalCustomerId: string;
}): Promise<number> => {
	const rows = (await ctx.db.query.migrationItemRuns.findMany({
		where: (mir, { and, eq }) =>
			and(
				eq(mir.migration_internal_id, migration.internal_id),
				eq(mir.item_kind, MigrationItemKind.Customer),
				eq(mir.item_id, internalCustomerId),
				eq(mir.dry_run, false),
			),
	})) as MigrationItemRun[];
	return rows.length;
};

/** Start a lazy migration. Only one active `migration_runs` row can exist
 *  per `(org, env)` (partial unique index), so concurrent tests in the same
 *  file serialize here: if another test holds the claim, we poll until it
 *  releases (succeeded / failed) then try again. */
export const startLazyMigration = async ({
	autumnV2_2,
	ctx,
	id,
	planId,
	timeoutMs = 120_000,
	pollIntervalMs = 500,
}: {
	autumnV2_2: AutumnV2_2;
	ctx: ScenarioCtx;
	id: string;
	planId: string;
	timeoutMs?: number;
	pollIntervalMs?: number;
}): Promise<{ migration: Migration; run_id: string }> => {
	const migration = await autumnV2_2.migrationsV2.deleteAndCreate(
		buildDashboardLazyMigration({ id, planId }),
	);

	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			const run = await autumnV2_2.migrationsV2.lazyRun({ id: migration.id });
			return { migration, run_id: run.run_id };
		} catch (error) {
			lastError = error;
			const code = (error as { code?: string } | undefined)?.code;
			if (code !== "migration_already_in_progress") throw error;
			await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
		}
	}

	throw new Error(
		`startLazyMigration: timed out after ${timeoutMs}ms waiting for another run to release. last error: ${
			lastError instanceof Error ? lastError.message : String(lastError)
		}`,
	);
};

/** Fetch the customer and poll until the migration's added feature shows up.
 *  Used as the standard “fetch + wait for lazy migration to land” primitive. */
export const getCustomerAndAwaitMigration = async ({
	autumnV2_2,
	customerId,
	featureId = TestFeature.Dashboard,
	timeoutMs = 60_000,
	pollIntervalMs = 1_000,
}: {
	autumnV2_2: AutumnV2_2;
	customerId: string;
	featureId?: string;
	timeoutMs?: number;
	pollIntervalMs?: number;
}): Promise<ApiCustomerV5> => {
	let latest: ApiCustomerV5 | undefined;
	await waitForMigrationResult({
		timeoutMs,
		pollIntervalMs,
		waitFor: async () => {
			latest = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
			expect(latest.flags[featureId]).toBeDefined();
		},
	});
	if (!latest) throw new Error("getCustomerAndAwaitMigration: no response");
	return latest;
};

/** Wipe every `migration_runs` row for the test org/env. */
export const cleanupMigrationRunsForOrg = async ({
	ctx,
}: {
	ctx: ScenarioCtx;
}): Promise<void> => {
	await ctx.db
		.delete(migrationRuns)
		.where(
			and(eq(migrationRuns.org_id, ctx.org.id), eq(migrationRuns.env, ctx.env)),
		);
};

/** Mark a lazy run as done via the real `finishLazyMigrationRun` action and
 *  bust the org cache. Use this in `finally` blocks so each test cleans up
 *  ITS OWN run without stepping on concurrent tests. Idempotent — safe to
 *  call multiple times. */
export const releaseLazyMigrationRun = async ({
	ctx,
	runId,
}: {
	ctx: ScenarioCtx;
	runId: string;
}): Promise<void> => {
	await finishLazyMigrationRun({ ctx, runId });
};

export { MigrationItemRunStatus };
