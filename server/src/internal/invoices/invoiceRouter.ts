import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleRedirectToInvoice } from "./handlers/handleRedirectToInvoice.js";

export const publicInvoiceRouter = new Hono<HonoEnv>();

// Rate limiter: 10 requests per minute
const invoiceRedirectLimiter = rateLimiter<HonoEnv>({
	windowMs: 60 * 1000, // 1 minute
	limit: 10,
	standardHeaders: "draft-6",
	keyGenerator: (c) => c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
});

publicInvoiceRouter.get(
	"/hosted_invoice_url/:invoiceId",
	invoiceRedirectLimiter,
	...handleRedirectToInvoice,
);