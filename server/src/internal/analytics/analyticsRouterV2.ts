import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleAnalyticsAggregation } from "./handlers/handleAnalyticsAggregation.js";

export const analyticsRouterV2 = new Hono<HonoEnv>();

analyticsRouterV2.post("", ...handleAnalyticsAggregation);
