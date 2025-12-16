import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleEventList } from "./handlers/handleEventList.js";
import { handleEventsAggregation } from "./handlers/handleEventsAggregation.js";

export const eventsRouter = new Hono<HonoEnv>();

eventsRouter.post("aggregate", ...handleEventsAggregation);
eventsRouter.post("list", ...handleEventList);
