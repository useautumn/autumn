import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateRole } from "./handlers/handleCreateRole.js";
import { handleDeleteRole } from "./handlers/handleDeleteRole.js";
import { handleListRoles } from "./handlers/handleListRoles.js";
import { handleUpdateRole } from "./handlers/handleUpdateRole.js";

/** Role management for the dashboard. The public API exposes roles.list only. */
export const rolesRpcRouter = new Hono<HonoEnv>();

rolesRpcRouter.post("/roles.list", ...handleListRoles);
rolesRpcRouter.post("/roles.create", ...handleCreateRole);
rolesRpcRouter.post("/roles.update", ...handleUpdateRole);
rolesRpcRouter.post("/roles.delete", ...handleDeleteRole);
