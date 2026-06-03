import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetRevenueCatKeys } from "./handlers/handleGetRevenueCatKeys.js";
import { handleLinkRevenueCat } from "./handlers/handleLinkRevenueCat.js";
import { handleSyncRevenueCat } from "./handlers/handleSyncRevenueCat.js";

export const platformRpcRouter = new Hono<HonoEnv>();

platformRpcRouter.post("/platform.link_revenuecat", ...handleLinkRevenueCat);
platformRpcRouter.post("/platform.sync_revenuecat", ...handleSyncRevenueCat);
platformRpcRouter.post(
	"/platform.get_revenuecat_keys",
	...handleGetRevenueCatKeys,
);
