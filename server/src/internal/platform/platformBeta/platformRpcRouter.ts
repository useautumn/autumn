import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleDisconnectStripe } from "./handlers/handleDisconnectStripe.js";
import { handleGetRevenueCatKeys } from "./handlers/handleGetRevenueCatKeys.js";
import { handleGetStripeConnection } from "./handlers/handleGetStripeConnection.js";
import { handleLinkRevenueCat } from "./handlers/handleLinkRevenueCat.js";
import { handleSyncRevenueCat } from "./handlers/handleSyncRevenueCat.js";

export const platformRpcRouter = new Hono<HonoEnv>();

platformRpcRouter.post(
	"/platform.get_stripe_connection",
	...handleGetStripeConnection,
);
platformRpcRouter.post(
	"/platform.disconnect_stripe",
	...handleDisconnectStripe,
);

platformRpcRouter.post("/platform.link_revenuecat", ...handleLinkRevenueCat);
platformRpcRouter.post("/platform.sync_revenuecat", ...handleSyncRevenueCat);
platformRpcRouter.post(
	"/platform.get_revenuecat_keys",
	...handleGetRevenueCatKeys,
);
