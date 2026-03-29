import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetEventNames } from "./internalHandlers/handleGetEventNames.js";
import { handleInternalAggregateEvents } from "./internalHandlers/handleInternalAggregateEvents.js";
import { handleInternalListRawEvents } from "./internalHandlers/handleInternalListRawEvents.js";
import { handleListEventNames } from "./internalHandlers/handleListEventNames.js";
import {
	handleArpc,
	handleCustomerLeaderboard,
	handleInvoiceStatus,
	handleRevenueByProduct,
	handleRevenueProductShare,
} from "./internalHandlers/handleRevenueAnalytics.js";

export const internalAnalyticsRouter = new Hono<HonoEnv>();

internalAnalyticsRouter.get("/event_names", ...handleGetEventNames);
internalAnalyticsRouter.get("/event_names/list", ...handleListEventNames);
internalAnalyticsRouter.post("/events", ...handleInternalAggregateEvents);
internalAnalyticsRouter.post("/raw", ...handleInternalListRawEvents);

internalAnalyticsRouter.post("/revenue/by-product", ...handleRevenueByProduct);
internalAnalyticsRouter.post(
	"/revenue/product-share",
	...handleRevenueProductShare,
);
internalAnalyticsRouter.post("/revenue/arpc", ...handleArpc);
internalAnalyticsRouter.post("/revenue/invoice-status", ...handleInvoiceStatus);
internalAnalyticsRouter.post(
	"/revenue/customer-leaderboard",
	...handleCustomerLeaderboard,
);
