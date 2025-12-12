import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleEventsAggregation } from "./handlers/handleEventsAggregation.js";

export const eventsRouter = new Hono<HonoEnv>();

eventsRouter.post("aggregate", ...handleEventsAggregation);
