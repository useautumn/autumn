import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getArpc,
	getCustomerLeaderboard,
	getInvoiceStatus,
	getRevenueByProduct,
	getRevenueProductShare,
} from "../actions/revenueAnalytics.js";

export const handleRevenueByProduct = createRoute({
	body: z.object({
		granularity: z.enum(["day", "month", "year"]).default("month"),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { granularity } = c.req.valid("json");
		const result = await getRevenueByProduct({ ctx, granularity });
		return c.json(result);
	},
});

export const handleRevenueProductShare = createRoute({
	body: z.object({}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const result = await getRevenueProductShare({ ctx });
		return c.json(result);
	},
});

export const handleArpc = createRoute({
	body: z.object({}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const result = await getArpc({ ctx });
		return c.json(result);
	},
});

export const handleInvoiceStatus = createRoute({
	body: z.object({}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const result = await getInvoiceStatus({ ctx });
		return c.json(result);
	},
});

export const handleCustomerLeaderboard = createRoute({
	body: z.object({}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const result = await getCustomerLeaderboard({ ctx });
		return c.json(result);
	},
});
