import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleInsightsQuery } from "./handlers/handleInsightsQuery";

export const insightsRouter = new Hono<HonoEnv>();

insightsRouter.post("/query", ...handleInsightsQuery);
