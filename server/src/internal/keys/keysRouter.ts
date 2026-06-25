import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleMintKey } from "./handleMintKey.js";
import { handleRefreshKey } from "./handleRefreshKey.js";
import { handleRevokeKey } from "./handleRevokeKey.js";

export const keysRpcRouter = new Hono<HonoEnv>();
keysRpcRouter.post("/keys.mint", ...handleMintKey);
keysRpcRouter.post("/keys.refresh", ...handleRefreshKey);
keysRpcRouter.post("/keys.revoke", ...handleRevokeKey);
