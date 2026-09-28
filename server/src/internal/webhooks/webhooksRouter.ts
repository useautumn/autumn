import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateWebhook } from "./handlers/handleCreateWebhook.js";
import { handleDeleteWebhook } from "./handlers/handleDeleteWebhook.js";
import { handleGetWebhook } from "./handlers/handleGetWebhook.js";
import { handleListWebhooks } from "./handlers/handleListWebhooks.js";
import { handlePreviewSyncWebhooks } from "./handlers/handlePreviewSyncWebhooks.js";
import { handleSyncWebhooks } from "./handlers/handleSyncWebhooks.js";
import { handleUpdateWebhook } from "./handlers/handleUpdateWebhook.js";

export const webhooksRpcRouter = new Hono<HonoEnv>();

webhooksRpcRouter.post("/webhooks.create", ...handleCreateWebhook);
webhooksRpcRouter.post("/webhooks.get", ...handleGetWebhook);
webhooksRpcRouter.post("/webhooks.list", ...handleListWebhooks);
webhooksRpcRouter.post("/webhooks.update", ...handleUpdateWebhook);
webhooksRpcRouter.post("/webhooks.delete", ...handleDeleteWebhook);
webhooksRpcRouter.post("/webhooks.preview_sync", ...handlePreviewSyncWebhooks);
webhooksRpcRouter.post("/webhooks.sync", ...handleSyncWebhooks);
