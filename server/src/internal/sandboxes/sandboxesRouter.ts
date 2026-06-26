import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateSandbox } from "./handlers/handleCreateSandbox.js";
import { handleDeleteSandbox } from "./handlers/handleDeleteSandbox.js";
import { handleListSandboxes } from "./handlers/handleListSandboxes.js";
import { handleUpdateSandbox } from "./handlers/handleUpdateSandbox.js";

export const sandboxesRpcRouter = new Hono<HonoEnv>();

sandboxesRpcRouter.post("/sandboxes.create", ...handleCreateSandbox);
sandboxesRpcRouter.post("/sandboxes.list", ...handleListSandboxes);
sandboxesRpcRouter.post("/sandboxes.delete", ...handleDeleteSandbox);
sandboxesRpcRouter.post("/sandboxes.update", ...handleUpdateSandbox);
