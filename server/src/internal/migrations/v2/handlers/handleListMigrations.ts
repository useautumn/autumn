import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { listMigrationStatuses } from "@/internal/migrations/v2/actions/migrationStatus/index.js";
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

		const [liveRunIds, statuses, products] = await Promise.all([
			migrationItemRunRepo.listIdsWithLiveRuns({
				ctx,
				migrationInternalIds: migrations.map((m) => m.internal_id),
			}),
			listMigrationStatuses({ ctx, migrations }),
			migrations.some((m) => m.operations)
				? ProductService.listFull({
						db: ctx.db,
						orgId: ctx.org.id,
						env: ctx.env,
						returnAll: true,
					})
				: Promise.resolve([]),
		]);

		const enriched = migrations.map((m) => {
			const statusInfo = statuses.get(m.internal_id);
			return {
				...m,
				status: statusInfo?.status ?? "draft",
				blocked_by: statusInfo?.blocked_by ?? null,
				has_live_runs: liveRunIds.has(m.internal_id),
				batch_eligible: isBatchEligibleMigrationDefinition({
					migration: m,
					products,
					features: ctx.features,
				}),
			};
		});

		return c.json({ list: enriched });
	},
});
