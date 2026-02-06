import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleExternalAggregateEvents } from "../events/handlers/handleExternalAggregateEvents.js";

export const legacyAnalyticsRouter = new Hono<HonoEnv>();

legacyAnalyticsRouter.post("", ...handleExternalAggregateEvents);
