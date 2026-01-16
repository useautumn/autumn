import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetEventNames } from "./internalHandlers/handleGetEventNames.js";
import { handleQueryEvents } from "./internalHandlers/handleQueryEvents.js";
import { handleQueryRawEvents } from "./internalHandlers/handleQueryRawEvents.js";

export const internalAnalyticsRouter = new Hono<HonoEnv>();

internalAnalyticsRouter.get("/event_names", ...handleGetEventNames);
internalAnalyticsRouter.post("/events", ...handleQueryEvents);
internalAnalyticsRouter.post("/raw", ...handleQueryRawEvents);
