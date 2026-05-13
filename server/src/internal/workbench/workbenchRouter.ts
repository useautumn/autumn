import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleListRequestLogs } from "./handlers/handleListRequestLogs.js";

export const workbenchRouter = new Hono<HonoEnv>();

workbenchRouter.post("/requests", ...handleListRequestLogs);
