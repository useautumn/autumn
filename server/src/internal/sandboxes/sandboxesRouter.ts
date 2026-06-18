import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateSandbox } from "./handlers/handleCreateSandbox.js";
import { handleListSandboxes } from "./handlers/handleListSandboxes.js";

export const sandboxesRpcRouter = new Hono<HonoEnv>();

sandboxesRpcRouter.post("/sandboxes.create", ...handleCreateSandbox);
sandboxesRpcRouter.post("/sandboxes.list", ...handleListSandboxes);
