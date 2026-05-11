import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { migrationItemEventRepo } from "../repos/index.js";

const ListMigrationItemEventsBody = z.object({
	migrationId: z.string(),
	migrationRunId: z.string().optional(),
});

export const handleListMigrationItemEvents = createRoute({
	scopes: [Scopes.Migrations.Read],
	body: ListMigrationItemEventsBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { migrationId, migrationRunId } = c.req.valid("json");
		const events = await migrationItemEventRepo.list({
			ctx,
			migrationId,
			migrationRunId,
		});

		return c.json({ list: events });
	},
});
