import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateChatInstall } from "./handlers/handleCreateChatInstall.js";
import { handleDisconnectChat } from "./handlers/handleDisconnectChat.js";
import { handleGetChat } from "./handlers/handleGetChat.js";
import { handleUpdateChatSettings } from "./handlers/handleUpdateChatSettings.js";

export const chatRouter = new Hono<HonoEnv>();

chatRouter.get("/", ...handleGetChat);
chatRouter.post("/install", ...handleCreateChatInstall);
chatRouter.patch("/:provider", ...handleUpdateChatSettings);
chatRouter.delete("/:provider", ...handleDisconnectChat);
