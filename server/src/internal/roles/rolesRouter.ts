import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateRole } from "./handlers/handleCreateRole.js";
import { handleDeleteRole } from "./handlers/handleDeleteRole.js";
import { handleListRoles } from "./handlers/handleListRoles.js";
import { handleUpdateRole } from "./handlers/handleUpdateRole.js";

export const rolesRouter = new Hono<HonoEnv>();

rolesRouter.get("", ...handleListRoles);
rolesRouter.post("", ...handleCreateRole);
rolesRouter.patch("/:name", ...handleUpdateRole);
rolesRouter.delete("/:name", ...handleDeleteRole);
