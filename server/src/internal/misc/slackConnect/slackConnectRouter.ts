import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleRequestSlackInvite } from "./handleRequestSlackInvite.js";

export const slackConnectRouter = new Hono<HonoEnv>();

slackConnectRouter.post("/invite", ...handleRequestSlackInvite);
