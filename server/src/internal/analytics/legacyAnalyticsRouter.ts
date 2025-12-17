import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleEventsAggregation } from "../events/handlers/handleEventsAggregation.js";

export const legacyAnalyticsRouter = new Hono<HonoEnv>();

legacyAnalyticsRouter.post("", ...handleEventsAggregation);
