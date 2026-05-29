/**
 * TDD coverage for migration filter planning preserving customer selection.
 *
 * Red-failure mode (pre-planner guardrail):
 *  - An optimized access path could return a narrower customer set than the
 *    existing fallback compiler once wrapper filters are applied.
 *
 * Green-success criteria:
 *  - Planned and fallback SQL return the same customers, and migration
 *    wrappers (processed rows, checkpointing, search, cursoring) preserve
 *    their existing semantics.
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	customerProducts,
	customers,
	MigrationItemKind,
	MigrationItemRunStatus,
	migrationItemRuns,
	migrations,
	products as productsTable,
	type CustomerFilter,
} from "@autumn/shared";
import { compileFilter } from "@autumn/shared/api/migrations/compiler/compileFilter.js";
import chalk from "chalk";
import { sql, type SQL } from "drizzle-orm";
import {
	buildCustomerCount,
	buildCustomerSelect,
	buildProcessedPreviewCount,
	buildProcessedPreviewSelect,
	type CustomerQueryArgs,
	type IncludeProcessed,
} from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import { rawWithParamsToDrizzle } from "@/internal/migrations/v2/filters/rawWithParamsToDrizzle.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";

const CREATED_AT = 1_780_000_000_000;
const sorted = (values: string[]) => [...values].sort();

type TestCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];
type TestDb = TestCtx["db"];

type SeededFixture = {
	ctx: TestCtx;
	prefix: string;
	migrationInternalId: string;
	migrationRunId: string;
	otherDryRunId: string;
	customerIds: {
		active: string;
		scheduled: string;
		pastDue: string;
		duplicateProducts: string;
		expired: string;
		pro: string;
		otherEnv: string;
	};
	args: CustomerQueryArgs;
};

const executeCustomerIds = async ({
	db,
	query,
}: {
	db: TestDb;
	query: SQL;
}) => {
	const rows = (await db.execute(query)) as Array<{ id: string }>;
	return rows.map((row) => row.id);
};

const executeCount = async ({ db, query }: { db: TestDb; query: SQL }) => {
	const [{ count }] = (await db.execute(query)) as Array<{
		count: bigint | number;
	}>;
	return Number(count);
};

const cleanupSeededRows = async ({
	db,
	prefix,
}: {
	db: TestDb;
	prefix: string;
}) => {
	const pattern = `${prefix}-%`;
	await db.execute(
		sql`DELETE FROM migration_item_runs WHERE migration_internal_id LIKE ${pattern}`,
	);
	await db.execute(sql`DELETE FROM migrations WHERE internal_id LIKE ${pattern}`);
	await db.execute(sql`DELETE FROM customer_products WHERE id LIKE ${pattern}`);
	await db.execute(sql`DELETE FROM customers WHERE internal_id LIKE ${pattern}`);
	await db.execute(sql`DELETE FROM products WHERE internal_id LIKE ${pattern}`);
};

const buildFallbackCustomerSelect = ({
	orgId,
	env,
	filter,
	ctx,
}: CustomerQueryArgs): SQL => {
	const where = rawWithParamsToDrizzle(
		compileFilter({ filter, ctx, ambient: { orgId, env } }),
	);
	return sql`
		SELECT c.internal_id, c.id, c.name, c.email
		FROM customers c
		WHERE (${where})
		ORDER BY c.internal_id DESC
	`;
};

const seedPlannerFixture = async (prefix: string): Promise<SeededFixture> => {
	const targetPlanId = `${prefix}-enterprise`;
	const otherPlanId = `${prefix}-pro`;
	const otherEnv = "live";
	const { ctx } = await initScenario({ setup: [], actions: [] });

	const customerIds = {
		active: `${prefix}-active`,
		scheduled: `${prefix}-scheduled`,
		pastDue: `${prefix}-past-due`,
		duplicateProducts: `${prefix}-duplicate-products`,
		expired: `${prefix}-expired`,
		pro: `${prefix}-pro`,
		otherEnv: `${prefix}-other-env`,
	};

	await cleanupSeededRows({ db: ctx.db, prefix });
	await ctx.db.insert(productsTable).values([
		{
			internal_id: `${prefix}-prod-enterprise-v1`,
			id: targetPlanId,
			name: "Enterprise v1",
			org_id: ctx.org.id,
			env: ctx.env,
			created_at: CREATED_AT,
			version: 1,
		},
		{
			internal_id: `${prefix}-prod-enterprise-v2`,
			id: targetPlanId,
			name: "Enterprise v2",
			org_id: ctx.org.id,
			env: ctx.env,
			created_at: CREATED_AT,
			version: 2,
		},
		{
			internal_id: `${prefix}-prod-pro`,
			id: otherPlanId,
			name: "Pro",
			org_id: ctx.org.id,
			env: ctx.env,
			created_at: CREATED_AT,
			version: 1,
		},
		{
			internal_id: `${prefix}-prod-enterprise-other-env`,
			id: targetPlanId,
			name: "Enterprise other env",
			org_id: ctx.org.id,
			env: otherEnv,
			created_at: CREATED_AT,
			version: 1,
		},
	]);
	await ctx.db.insert(customers).values([
		{
			internal_id: `${prefix}-cus-active`,
			id: customerIds.active,
			name: "Alpha Active Enterprise",
			email: `${prefix}-active@example.com`,
			org_id: ctx.org.id,
			env: ctx.env,
			created_at: CREATED_AT,
		},
		{
			internal_id: `${prefix}-cus-scheduled`,
			id: customerIds.scheduled,
			name: "Bravo Scheduled Enterprise",
			email: `${prefix}-scheduled@example.com`,
			org_id: ctx.org.id,
			env: ctx.env,
			created_at: CREATED_AT,
		},
		{
			internal_id: `${prefix}-cus-past-due`,
			id: customerIds.pastDue,
			name: "Charlie Past Due Enterprise",
			email: `${prefix}-past-due@example.com`,
			org_id: ctx.org.id,
			env: ctx.env,
			created_at: CREATED_AT,
		},
		{
			internal_id: `${prefix}-cus-duplicate-products`,
			id: customerIds.duplicateProducts,
			name: "Delta Duplicate Enterprise Products",
			email: `${prefix}-duplicate-products@example.com`,
			org_id: ctx.org.id,
			env: ctx.env,
			created_at: CREATED_AT,
		},
		{
			internal_id: `${prefix}-cus-expired`,
			id: customerIds.expired,
			name: "Echo Expired Enterprise",
			email: `${prefix}-expired@example.com`,
			org_id: ctx.org.id,
			env: ctx.env,
			created_at: CREATED_AT,
		},
		{
			internal_id: `${prefix}-cus-pro`,
			id: customerIds.pro,
			name: "Foxtrot Pro",
			email: `${prefix}-pro@example.com`,
			org_id: ctx.org.id,
			env: ctx.env,
			created_at: CREATED_AT,
		},
		{
			internal_id: `${prefix}-cus-other-env`,
			id: customerIds.otherEnv,
			name: "Golf Other Env Enterprise",
			email: `${prefix}-other-env@example.com`,
			org_id: ctx.org.id,
			env: otherEnv,
			created_at: CREATED_AT,
		},
	]);
	await ctx.db.insert(customerProducts).values([
		{
			id: `${prefix}-cp-active`,
			internal_customer_id: `${prefix}-cus-active`,
			internal_product_id: `${prefix}-prod-enterprise-v1`,
			product_id: targetPlanId,
			status: CusProductStatus.Active,
		},
		{
			id: `${prefix}-cp-scheduled`,
			internal_customer_id: `${prefix}-cus-scheduled`,
			internal_product_id: `${prefix}-prod-enterprise-v1`,
			product_id: targetPlanId,
			status: CusProductStatus.Scheduled,
		},
		{
			id: `${prefix}-cp-past-due`,
			internal_customer_id: `${prefix}-cus-past-due`,
			internal_product_id: `${prefix}-prod-enterprise-v1`,
			product_id: targetPlanId,
			status: CusProductStatus.PastDue,
		},
		{
			id: `${prefix}-cp-duplicate-v1`,
			internal_customer_id: `${prefix}-cus-duplicate-products`,
			internal_product_id: `${prefix}-prod-enterprise-v1`,
			product_id: targetPlanId,
			status: CusProductStatus.Active,
		},
		{
			id: `${prefix}-cp-duplicate-v2`,
			internal_customer_id: `${prefix}-cus-duplicate-products`,
			internal_product_id: `${prefix}-prod-enterprise-v2`,
			product_id: targetPlanId,
			status: CusProductStatus.Scheduled,
		},
		{
			id: `${prefix}-cp-expired`,
			internal_customer_id: `${prefix}-cus-expired`,
			internal_product_id: `${prefix}-prod-enterprise-v1`,
			product_id: targetPlanId,
			status: CusProductStatus.Expired,
		},
		{
			id: `${prefix}-cp-pro`,
			internal_customer_id: `${prefix}-cus-pro`,
			internal_product_id: `${prefix}-prod-pro`,
			product_id: otherPlanId,
			status: CusProductStatus.Active,
		},
		{
			id: `${prefix}-cp-other-env`,
			internal_customer_id: `${prefix}-cus-other-env`,
			internal_product_id: `${prefix}-prod-enterprise-other-env`,
			product_id: targetPlanId,
			status: CusProductStatus.Active,
		},
	]);

	const migrationInternalId = `${prefix}-migration`;
	const migrationRunId = `${prefix}-run`;
	await ctx.db.insert(migrations).values({
		internal_id: migrationInternalId,
		id: `${prefix}-migration`,
		org_id: ctx.org.id,
		env: ctx.env,
		filter: { customer: { plan: { plan_id: targetPlanId } } },
		created_at: CREATED_AT,
	});

	return {
		ctx,
		prefix,
		migrationInternalId,
		migrationRunId,
		otherDryRunId: `${prefix}-other-dry-run`,
		customerIds,
		args: {
			orgId: ctx.org.id,
			env: ctx.env,
			filter: { plan: { plan_id: targetPlanId } },
			ctx: { features: ctx.features },
		},
	};
};

const withSeededFixture = async (
	prefix: string,
	run: (fixture: SeededFixture) => Promise<void>,
) => {
	const fixture = await seedPlannerFixture(prefix);
	try {
		await run(fixture);
	} finally {
		await cleanupSeededRows({ db: fixture.ctx.db, prefix });
	}
};

const insertItemRun = async ({
	db,
	migrationInternalId,
	migrationRunId,
	itemId,
	status,
	dryRun = false,
}: {
	db: TestDb;
	migrationInternalId: string;
	migrationRunId: string;
	itemId: string;
	status: MigrationItemRunStatus;
	dryRun?: boolean;
}) => {
	await db.insert(migrationItemRuns).values({
		migration_item_run_id: `${migrationInternalId}-${migrationRunId}-${itemId}-${status}-${dryRun ? "dry" : "live"}`,
		migration_internal_id: migrationInternalId,
		migration_run_id: migrationRunId,
		dry_run: dryRun,
		item_kind: MigrationItemKind.Customer,
		item_id: itemId,
		status,
		created_at: CREATED_AT,
		updated_at: CREATED_AT,
	});
};

const includeProcessed = (
	fixture: SeededFixture,
	executionFilter?: IncludeProcessed["executionFilter"],
): IncludeProcessed => ({
	migrationInternalId: fixture.migrationInternalId,
	executionFilter,
});

test(`${chalk.yellowBright("migration filter planner: plan_id access path matches fallback customer set")}`, async () => {
	await withSeededFixture("planner-parity-base", async (fixture) => {
		const plannedIds = await executeCustomerIds({
			db: fixture.ctx.db,
			query: buildCustomerSelect(fixture.args),
		});
		const fallbackIds = await executeCustomerIds({
			db: fixture.ctx.db,
			query: buildFallbackCustomerSelect(fixture.args),
		});

		expect(sorted(plannedIds)).toEqual(sorted(fallbackIds));
		expect(sorted(plannedIds)).toEqual(
			sorted([
				fixture.customerIds.active,
				fixture.customerIds.scheduled,
				fixture.customerIds.pastDue,
				fixture.customerIds.duplicateProducts,
			]),
		);
		expect(new Set(plannedIds).size).toBe(plannedIds.length);
	});
});

test(`${chalk.yellowBright("migration filter planner: includeProcessed unions stale processed rows once")}`, async () => {
	await withSeededFixture("planner-parity-processed-union", async (fixture) => {
		await insertItemRun({
			db: fixture.ctx.db,
			migrationInternalId: fixture.migrationInternalId,
			migrationRunId: fixture.migrationRunId,
			itemId: `${fixture.prefix}-cus-pro`,
			status: MigrationItemRunStatus.Succeeded,
		});
		await insertItemRun({
			db: fixture.ctx.db,
			migrationInternalId: fixture.migrationInternalId,
			migrationRunId: fixture.migrationRunId,
			itemId: `${fixture.prefix}-cus-active`,
			status: MigrationItemRunStatus.Succeeded,
		});

		const ids = await executeCustomerIds({
			db: fixture.ctx.db,
			query: buildProcessedPreviewSelect({
				...fixture.args,
				includeProcessed: includeProcessed(fixture),
			}),
		});
		const count = await executeCount({
			db: fixture.ctx.db,
			query: buildProcessedPreviewCount({
				...fixture.args,
				includeProcessed: includeProcessed(fixture),
			}),
		});

		expect(sorted(ids)).toEqual(
			sorted([
				fixture.customerIds.active,
				fixture.customerIds.scheduled,
				fixture.customerIds.pastDue,
				fixture.customerIds.duplicateProducts,
				fixture.customerIds.pro,
			]),
		);
		expect(new Set(ids).size).toBe(ids.length);
		expect(count).toBe(5);
	});
});

test(`${chalk.yellowBright("migration filter planner: explicit processed statuses ignore current filter")}`, async () => {
	await withSeededFixture("planner-parity-explicit-status", async (fixture) => {
		await insertItemRun({
			db: fixture.ctx.db,
			migrationInternalId: fixture.migrationInternalId,
			migrationRunId: fixture.migrationRunId,
			itemId: `${fixture.prefix}-cus-active`,
			status: MigrationItemRunStatus.Succeeded,
		});
		await insertItemRun({
			db: fixture.ctx.db,
			migrationInternalId: fixture.migrationInternalId,
			migrationRunId: fixture.migrationRunId,
			itemId: `${fixture.prefix}-cus-pro`,
			status: MigrationItemRunStatus.Succeeded,
		});
		await insertItemRun({
			db: fixture.ctx.db,
			migrationInternalId: fixture.migrationInternalId,
			migrationRunId: fixture.migrationRunId,
			itemId: `${fixture.prefix}-cus-scheduled`,
			status: MigrationItemRunStatus.Failed,
		});

		const ids = await executeCustomerIds({
			db: fixture.ctx.db,
			query: buildProcessedPreviewSelect({
				...fixture.args,
				includeProcessed: includeProcessed(fixture, {
					statuses: [MigrationItemRunStatus.Succeeded],
				}),
			}),
		});

		expect(sorted(ids)).toEqual(
			sorted([fixture.customerIds.active, fixture.customerIds.pro]),
		);
	});
});

test(`${chalk.yellowBright("migration filter planner: not_run excludes any processed customer")}`, async () => {
	await withSeededFixture("planner-parity-not-run", async (fixture) => {
		await insertItemRun({
			db: fixture.ctx.db,
			migrationInternalId: fixture.migrationInternalId,
			migrationRunId: fixture.migrationRunId,
			itemId: `${fixture.prefix}-cus-active`,
			status: MigrationItemRunStatus.Succeeded,
		});
		await insertItemRun({
			db: fixture.ctx.db,
			migrationInternalId: fixture.migrationInternalId,
			migrationRunId: fixture.migrationRunId,
			itemId: `${fixture.prefix}-cus-scheduled`,
			status: MigrationItemRunStatus.Failed,
		});

		const ids = await executeCustomerIds({
			db: fixture.ctx.db,
			query: buildProcessedPreviewSelect({
				...fixture.args,
				includeProcessed: includeProcessed(fixture, { statuses: ["not_run"] }),
			}),
		});

		expect(sorted(ids)).toEqual(
			sorted([
				fixture.customerIds.pastDue,
				fixture.customerIds.duplicateProducts,
			]),
		);
	});
});

test(`${chalk.yellowBright("migration filter planner: mixed statuses include succeeded stale rows and matching not-run rows")}`, async () => {
	await withSeededFixture("planner-parity-mixed-status", async (fixture) => {
		await insertItemRun({
			db: fixture.ctx.db,
			migrationInternalId: fixture.migrationInternalId,
			migrationRunId: fixture.migrationRunId,
			itemId: `${fixture.prefix}-cus-pro`,
			status: MigrationItemRunStatus.Succeeded,
		});
		await insertItemRun({
			db: fixture.ctx.db,
			migrationInternalId: fixture.migrationInternalId,
			migrationRunId: fixture.migrationRunId,
			itemId: `${fixture.prefix}-cus-scheduled`,
			status: MigrationItemRunStatus.Failed,
		});

		const ids = await executeCustomerIds({
			db: fixture.ctx.db,
			query: buildProcessedPreviewSelect({
				...fixture.args,
				includeProcessed: includeProcessed(fixture, {
					statuses: [MigrationItemRunStatus.Succeeded, "not_run"],
				}),
			}),
		});

		expect(sorted(ids)).toEqual(
			sorted([
				fixture.customerIds.active,
				fixture.customerIds.pastDue,
				fixture.customerIds.duplicateProducts,
				fixture.customerIds.pro,
			]),
		);
	});
});

test(`${chalk.yellowBright("migration filter planner: checkpoint excludes completed items from run selection")}`, async () => {
	await withSeededFixture("planner-parity-checkpoint", async (fixture) => {
		await insertItemRun({
			db: fixture.ctx.db,
			migrationInternalId: fixture.migrationInternalId,
			migrationRunId: fixture.migrationRunId,
			itemId: `${fixture.prefix}-cus-active`,
			status: MigrationItemRunStatus.Succeeded,
		});
		await insertItemRun({
			db: fixture.ctx.db,
			migrationInternalId: fixture.migrationInternalId,
			migrationRunId: fixture.migrationRunId,
			itemId: `${fixture.prefix}-cus-scheduled`,
			status: MigrationItemRunStatus.Failed,
		});

		const idsWithoutRetry = await executeCustomerIds({
			db: fixture.ctx.db,
			query: buildCustomerSelect({
				...fixture.args,
				checkpoint: {
					migrationInternalId: fixture.migrationInternalId,
					migrationRunId: fixture.migrationRunId,
					dryRun: false,
					excludedStatuses: [
						MigrationItemRunStatus.Running,
						MigrationItemRunStatus.Succeeded,
						MigrationItemRunStatus.Skipped,
						MigrationItemRunStatus.Failed,
					],
				},
			}),
		});
		const idsWithRetry = await executeCustomerIds({
			db: fixture.ctx.db,
			query: buildCustomerSelect({
				...fixture.args,
				checkpoint: {
					migrationInternalId: fixture.migrationInternalId,
					migrationRunId: fixture.migrationRunId,
					dryRun: false,
					excludedStatuses: [
						MigrationItemRunStatus.Running,
						MigrationItemRunStatus.Succeeded,
						MigrationItemRunStatus.Skipped,
					],
				},
			}),
		});

		expect(sorted(idsWithoutRetry)).toEqual(
			sorted([
				fixture.customerIds.pastDue,
				fixture.customerIds.duplicateProducts,
			]),
		);
		expect(sorted(idsWithRetry)).toEqual(
			sorted([
				fixture.customerIds.scheduled,
				fixture.customerIds.pastDue,
				fixture.customerIds.duplicateProducts,
			]),
		);
	});
});

test(`${chalk.yellowBright("migration filter planner: dry-run checkpoint scopes same run differently from other dry runs")}`, async () => {
	await withSeededFixture("planner-parity-dry-checkpoint", async (fixture) => {
		await insertItemRun({
			db: fixture.ctx.db,
			migrationInternalId: fixture.migrationInternalId,
			migrationRunId: fixture.migrationRunId,
			itemId: `${fixture.prefix}-cus-active`,
			status: MigrationItemRunStatus.Succeeded,
			dryRun: true,
		});
		await insertItemRun({
			db: fixture.ctx.db,
			migrationInternalId: fixture.migrationInternalId,
			migrationRunId: fixture.otherDryRunId,
			itemId: `${fixture.prefix}-cus-scheduled`,
			status: MigrationItemRunStatus.Succeeded,
			dryRun: true,
		});
		await insertItemRun({
			db: fixture.ctx.db,
			migrationInternalId: fixture.migrationInternalId,
			migrationRunId: fixture.migrationRunId,
			itemId: `${fixture.prefix}-cus-past-due`,
			status: MigrationItemRunStatus.Succeeded,
		});

		const ids = await executeCustomerIds({
			db: fixture.ctx.db,
			query: buildCustomerSelect({
				...fixture.args,
				checkpoint: {
					migrationInternalId: fixture.migrationInternalId,
					migrationRunId: fixture.migrationRunId,
					dryRun: true,
					excludedStatuses: [MigrationItemRunStatus.Succeeded],
				},
			}),
		});

		expect(sorted(ids)).toEqual(
			sorted([
				fixture.customerIds.scheduled,
				fixture.customerIds.duplicateProducts,
			]),
		);
	});
});

test(`${chalk.yellowBright("migration filter planner: search and customer_id narrowing remain residual filters")}`, async () => {
	await withSeededFixture("planner-parity-search-only", async (fixture) => {
		const searchIds = await executeCustomerIds({
			db: fixture.ctx.db,
			query: buildCustomerSelect({
				...fixture.args,
				search: "scheduled@example.com",
			}),
		});
		const onlyIds = await executeCustomerIds({
			db: fixture.ctx.db,
			query: buildCustomerSelect({
				...fixture.args,
				filter: {
					...fixture.args.filter,
					customer_id: { $in: [fixture.customerIds.pastDue] },
				},
			}),
		});

		expect(searchIds).toEqual([fixture.customerIds.scheduled]);
		expect(onlyIds).toEqual([fixture.customerIds.pastDue]);
	});
});

test(`${chalk.yellowBright("migration filter planner: cursor pagination is stable and complete")}`, async () => {
	await withSeededFixture("planner-parity-pagination", async (fixture) => {
		const firstPage = await executeCustomerIds({
			db: fixture.ctx.db,
			query: buildCustomerSelect({ ...fixture.args, limit: 2 }),
		});
		const secondPage = await executeCustomerIds({
			db: fixture.ctx.db,
			query: buildCustomerSelect({
				...fixture.args,
				limit: 10,
				afterInternalId: `${fixture.prefix}-cus-past-due`,
			}),
		});
		const allIds = await executeCustomerIds({
			db: fixture.ctx.db,
			query: buildCustomerSelect(fixture.args),
		});

		expect(firstPage).toEqual([
			fixture.customerIds.scheduled,
			fixture.customerIds.pastDue,
		]);
		expect(secondPage).toEqual([
			fixture.customerIds.duplicateProducts,
			fixture.customerIds.active,
		]);
		expect(sorted([...firstPage, ...secondPage])).toEqual(sorted(allIds));
		expect(
			await executeCount({
				db: fixture.ctx.db,
				query: buildCustomerCount(fixture.args),
			}),
		).toBe(4);
	});
});
