import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateOAuthApiKeys } from "./handlers/handleCreateOAuthApiKeys.js";

export const cliRouter = new Hono<HonoEnv>();

cliRouter.post("/api-keys", ...handleCreateOAuthApiKeys);
