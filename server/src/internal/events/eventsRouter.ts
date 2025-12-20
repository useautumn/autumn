import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleAggregateEvents } from "./handlers/handleAggregateEvents.js";
import { handleListEvents } from "./handlers/handleListEvents.js";

export const eventsRouter = new Hono<HonoEnv>();

eventsRouter.post("aggregate", ...handleAggregateEvents);
eventsRouter.post("list", ...handleListEvents);
