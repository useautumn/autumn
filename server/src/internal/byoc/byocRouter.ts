import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateCache } from "./handlers/handleCreateCache.js";
import { handleDeleteCache } from "./handlers/handleDeleteCache.js";
import { handleGetCache } from "./handlers/handleGetCache.js";
import { handleResizeCache } from "./handlers/handleResizeCache.js";
import { handleRetryCache } from "./handlers/handleRetryCache.js";
import { handleRevealCacheToken } from "./handlers/handleRevealCacheToken.js";

export const byocRpcRouter = new Hono<HonoEnv>();

byocRpcRouter.post("/byoc.create_atom", ...handleCreateCache);
byocRpcRouter.post("/byoc.get_atom", ...handleGetCache);
byocRpcRouter.post("/byoc.resize_atom", ...handleResizeCache);
byocRpcRouter.post("/byoc.retry_atom", ...handleRetryCache);
byocRpcRouter.post("/byoc.reveal_atom_token", ...handleRevealCacheToken);
byocRpcRouter.post("/byoc.delete_atom", ...handleDeleteCache);
