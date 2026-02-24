import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleExternalAggregateEvents } from "./handlers/handleExternalAggregateEvents.js";
import { handleExternalListEvents } from "./handlers/handleExternalListEvents.js";

export const eventsRouter = new Hono<HonoEnv>();

eventsRouter.post("aggregate", ...handleExternalAggregateEvents);
eventsRouter.post("list", ...handleExternalListEvents);

export const eventsRpcRouter = new Hono<HonoEnv>();
eventsRpcRouter.post("events.aggregate", ...handleExternalAggregateEvents);
eventsRpcRouter.post("events.list", ...handleExternalListEvents);
