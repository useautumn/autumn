import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import {
	migrationItemRunRepo,
	migrationRepo,
} from "@/internal/migrations/v2/repos/index.js";
import { isBatchEligibleMigrationDefinition } from "@/internal/migrations/v2/utils/shouldRunBatchLane.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** POST /migrations.list — list migrations for the current org + env. */
export const handleListMigrations = createRoute({
	scopes: [Scopes.Migrations.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const migrations = await migrationRepo.get({ ctx });

		if (migrations.length === 0) return c.json({ list: [] });

		const [liveRunIds, products] = await Promise.all([
			migrationItemRunRepo.listIdsWithLiveRuns({
				ctx,
				migrationInternalIds: migrations.map((m) => m.internal_id),
			}),
			migrations.some((m) => m.operations)
				? ProductService.listFull({
						db: ctx.db,
						orgId: ctx.org.id,
						env: ctx.env,
						returnAll: true,
					})
				: Promise.resolve([]),
		]);

		const enriched = migrations.map((m) => ({
			...m,
			has_live_runs: liveRunIds.has(m.internal_id),
			batch_eligible: isBatchEligibleMigrationDefinition({
				migration: m,
				products,
				features: ctx.features,
			}),
		}));

		return c.json({ list: enriched });
	},
});
