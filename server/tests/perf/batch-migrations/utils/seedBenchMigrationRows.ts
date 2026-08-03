import { type Migration, migrations } from "@autumn/shared";
import { MigrationFilterSchema } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import { OperationsSchema } from "@autumn/shared/api/migrations/operations/operations.js";
import { sql } from "drizzle-orm";
import { generateId } from "@/utils/genUtils.js";
import type { BenchContext } from "./benchContext.js";
import { BENCH_MIGRATIONS } from "./benchMigrationDefs.js";

/** Refreshes every dashboard-runnable bench migration to a clean definition. */
export const seedBenchMigrationRows = async ({
	bench,
}: {
	bench: BenchContext;
}): Promise<void> => {
	const { ctx, org } = bench;
	const { db } = ctx;

	for (const def of BENCH_MIGRATIONS) {
		await db.execute(
			sql`DELETE FROM migrations WHERE org_id = ${org.id} AND env = ${ctx.env} AND id = ${def.id}`,
		);
		const [migration] = (await db
			.insert(migrations)
			.values({
				internal_id: generateId("mig"),
				id: def.id,
				org_id: org.id,
				env: ctx.env,
				filter: MigrationFilterSchema.parse({
					customer: { plan: { plan_id: def.planId } },
				}),
				operations: OperationsSchema.parse({
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: def.planId },
							customize: { add_items: def.items },
						},
					],
				}),
				no_billing_changes: true,
				retry_failed: false,
				archived: false,
				created_at: Date.now(),
			})
			.returning()) as Migration[];
		console.log(
			`bench: seeded migration ${migration.id} (${def.planId}, ${def.items.length} item${def.items.length > 1 ? "s" : ""})`,
		);
	}
};
