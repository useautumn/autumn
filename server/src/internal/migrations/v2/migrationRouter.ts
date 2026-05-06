import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateMigration } from "./handlers/handleCreateMigration/handleCreateMigration.js";
import { handleListMigrations } from "./handlers/handleListMigrations/handleListMigrations.js";
import { handlePatchMigration } from "./handlers/handlePatchMigration/handlePatchMigration.js";
import { handlePrepareMigration } from "./handlers/handlePrepareMigration/handlePrepareMigration.js";

/**
 * V2 user-facing migrations RPC router. Distinct from the legacy
 * `migrationRouter` (product-version migration system in
 * `internal/products/productRouter.ts`).
 */
export const migrationRpcRouter = new Hono<HonoEnv>();

migrationRpcRouter.post("/migrations.create", ...handleCreateMigration);
migrationRpcRouter.post("/migrations.list", ...handleListMigrations);
migrationRpcRouter.post("/migrations.update", ...handlePatchMigration);
migrationRpcRouter.post("/migrations.prepare", ...handlePrepareMigration);
