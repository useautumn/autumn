import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateMigration } from "./handlers/handleCreateMigration.js";
import { handleDeleteMigration } from "./handlers/handleDeleteMigration.js";
import { handleListMigrationItemEvents } from "./handlers/handleListMigrationItemEvents.js";
import { handleListMigrationRuns } from "./handlers/handleListMigrationRuns.js";
import { handleListMigrations } from "./handlers/handleListMigrations.js";
import { handlePatchMigration } from "./handlers/handlePatchMigration.js";
import { handlePrepareMigration } from "./handlers/handlePrepareMigration.js";
import { handleRunMigration } from "./handlers/handleRunMigration.js";

/**
 * V2 user-facing migrations RPC router. Distinct from the legacy
 * `migrationRouter` (product-version migration system in
 * `internal/products/productRouter.ts`).
 */
export const migrationRpcRouter = new Hono<HonoEnv>();

migrationRpcRouter.post("/migrations.create", ...handleCreateMigration);
migrationRpcRouter.post("/migrations.list", ...handleListMigrations);
migrationRpcRouter.post("/migrations.update", ...handlePatchMigration);
migrationRpcRouter.post("/migrations.delete", ...handleDeleteMigration);
migrationRpcRouter.post("/migrations.prepare", ...handlePrepareMigration);
migrationRpcRouter.post("/migrations.run", ...handleRunMigration);
migrationRpcRouter.post("/migrations.runs.list", ...handleListMigrationRuns);
migrationRpcRouter.post(
	"/migrations.item_events.list",
	...handleListMigrationItemEvents,
);
