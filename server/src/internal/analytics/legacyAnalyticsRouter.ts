import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleAggregateEvents } from "../events/handlers/handleAggregateEvents.js";

export const legacyAnalyticsRouter = new Hono<HonoEnv>();

legacyAnalyticsRouter.post("", ...handleAggregateEvents);
