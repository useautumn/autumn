import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateCache } from "./handlers/handleCreateCache.js";
import { handleDeleteCache } from "./handlers/handleDeleteCache.js";
import { handleGetCache } from "./handlers/handleGetCache.js";

export const byocRpcRouter = new Hono<HonoEnv>();

byocRpcRouter.post("/byoc.create_cache", ...handleCreateCache);
byocRpcRouter.post("/byoc.get_cache", ...handleGetCache);
byocRpcRouter.post("/byoc.delete_cache", ...handleDeleteCache);
