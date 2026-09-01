import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleCreateSecretKey } from "./handlers/handleCreateSecretKey.js";
import { handleDeleteSecretKey } from "./handlers/handleDeleteSecretKey.js";
import { handleGetDevData } from "./handlers/handleGetDevData.js";
import { handleGetWebhookSubscriptions } from "./handlers/handleGetWebhookSubscriptions.js";
import { handleListHiddenApiKeys } from "./handlers/handleListHiddenApiKeys.js";

export const internalDevRouter = new Hono<HonoEnv>();
internalDevRouter.get("/data", ...handleGetDevData);
internalDevRouter.get(
	"/webhook_subscriptions",
	...handleGetWebhookSubscriptions,
);
internalDevRouter.post("/api_key", ...handleCreateSecretKey);
internalDevRouter.get("/api_key/hidden", ...handleListHiddenApiKeys);
internalDevRouter.delete("/api_key/:key_id", ...handleDeleteSecretKey);
