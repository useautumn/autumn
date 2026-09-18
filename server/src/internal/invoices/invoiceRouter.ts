import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateInvoice } from "./handlers/handleCreateInvoice.js";
import { handleGetStripeInvoice } from "./handlers/handleGetStripeInvoice.js";
import { handleInsertInvoices } from "./handlers/handleInsertInvoices.js";
import { handleListInvoices } from "./handlers/handleListInvoices.js";
import { handleListInvoiceTemplates } from "./handlers/handleListInvoiceTemplates.js";
import { handlePayInvoice } from "./handlers/handlePayInvoice.js";
import { handleRedirectToInvoice } from "./handlers/handleRedirectToInvoice.js";
import { handleReissueInvoice } from "./handlers/handleReissueInvoice.js";
import { handleVoidInvoice } from "./handlers/handleVoidInvoice.js";

export const publicInvoiceRouter = new Hono<HonoEnv>();

// Rate limiter: 10 requests per minute
const invoiceRedirectLimiter = rateLimiter<HonoEnv>({
	windowMs: 60 * 1000, // 1 minute
	limit: 10,
	standardHeaders: "draft-6",
	keyGenerator: (c) =>
		c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
});

publicInvoiceRouter.get(
	"/hosted_invoice_url/:invoiceId",
	invoiceRedirectLimiter,
	...handleRedirectToInvoice,
);

/**
 * Authenticated invoice router - requires secret key middleware
 * Mounted at /v1/invoices in apiRouter
 */
export const invoiceRouter = new Hono<HonoEnv>();

invoiceRouter.get("/:stripe_invoice_id/stripe", ...handleGetStripeInvoice);

export const invoiceRpcRouter = new Hono<HonoEnv>();

invoiceRpcRouter.post("/invoices.create", ...handleCreateInvoice);
invoiceRpcRouter.post("/invoices.insert", ...handleInsertInvoices);
invoiceRpcRouter.post("/invoices.list", ...handleListInvoices);
invoiceRpcRouter.post("/invoices.listTemplates", ...handleListInvoiceTemplates);
invoiceRpcRouter.post("/invoices.pay", ...handlePayInvoice);
invoiceRpcRouter.post("/invoices.void", ...handleVoidInvoice);
invoiceRpcRouter.post("/invoices.reissue", ...handleReissueInvoice);
