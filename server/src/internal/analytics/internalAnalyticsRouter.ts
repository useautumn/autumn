import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetEventNames } from "./internalHandlers/handleGetEventNames.js";
import { handleListEventNames } from "./internalHandlers/handleListEventNames.js";
import { handleQueryEvents } from "./internalHandlers/handleQueryEvents.js";
import { handleQueryRawEvents } from "./internalHandlers/handleQueryRawEvents.js";

export const internalAnalyticsRouter = new Hono<HonoEnv>();

internalAnalyticsRouter.get("/event_names", ...handleGetEventNames);
internalAnalyticsRouter.get("/event_names/list", ...handleListEventNames);
internalAnalyticsRouter.post("/events", ...handleQueryEvents);
internalAnalyticsRouter.post("/raw", ...handleQueryRawEvents);
