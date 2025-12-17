import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleEventsAggregation } from "./handlers/handleEventsAggregation.js";
import { handleListEvents } from "./handlers/handleListEvents.js";

export const eventsRouter = new Hono<HonoEnv>();

eventsRouter.post("aggregate", ...handleEventsAggregation);
eventsRouter.post("list", ...handleListEvents);
