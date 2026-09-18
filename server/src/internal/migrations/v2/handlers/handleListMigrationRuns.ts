import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { attachItemRunCounts } from "../actions/migrationRun/attachItemRunCounts.js";
import { listMigrationStatuses } from "../actions/migrationStatus/listMigrationStatuses.js";
import { migrationRepo, migrationRunRepo } from "../repos/index.js";

const ListMigrationRunsBody = z.object({
	migrationId: z.string(),
});

export const handleListMigrationRuns = createRoute({
	scopes: [Scopes.Migrations.Read],
	body: ListMigrationRunsBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { migrationId } = c.req.valid("json");
		const migration = await migrationRepo.find({ ctx, id: migrationId });
		const [runs, statuses] = await Promise.all([
			migrationRunRepo.list({
				ctx,
				migrationInternalId: migration.internal_id,
			}),
			listMigrationStatuses({ ctx, migrations: [migration] }),
		]);
		const statusInfo = statuses.get(migration.internal_id);
		const runsWithCounts = await attachItemRunCounts({
			ctx,
			migrationInternalId: migration.internal_id,
			runs,
		});

		return c.json({
			list: runsWithCounts,
			status: statusInfo?.status ?? "draft",
			blocked_by: statusInfo?.blocked_by ?? null,
		});
	},
});
