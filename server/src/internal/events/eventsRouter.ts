import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleExternalAggregateEvents } from "./handlers/handleExternalAggregateEvents.js";
import { handleExternalListEvents } from "./handlers/handleExternalListEvents.js";

export const eventsRouter = new Hono<HonoEnv>();

eventsRouter.post("aggregate", ...handleExternalAggregateEvents);
eventsRouter.post("list", ...handleExternalListEvents);
