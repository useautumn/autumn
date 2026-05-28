import {
	MigrationItemKind,
	migrationItemRuns,
	Scopes,
} from "@autumn/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

/** POST /migrations.list — list migrations for the current org + env. */
export const handleListMigrations = createRoute({
	scopes: [Scopes.Migrations.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const migrations = await migrationRepo.get({ ctx });

		if (migrations.length === 0) return c.json({ list: [] });

		const internalIds = migrations.map((m) => m.internal_id);

		const rows = await ctx.db
			.select({
				migration_internal_id: migrationItemRuns.migration_internal_id,
				count: sql<number>`count(*)::int`,
			})
			.from(migrationItemRuns)
			.where(
				and(
					inArray(migrationItemRuns.migration_internal_id, internalIds),
					eq(migrationItemRuns.item_kind, MigrationItemKind.Customer),
					eq(migrationItemRuns.dry_run, false),
				),
			)
			.groupBy(migrationItemRuns.migration_internal_id);

		const liveRunSet = new Set(rows.map((r) => r.migration_internal_id));

		const enriched = migrations.map((m) => ({
			...m,
			has_live_runs: liveRunSet.has(m.internal_id),
		}));

		return c.json({ list: enriched });
	},
});
