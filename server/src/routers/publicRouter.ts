import { Hono } from "hono";
import { analyticsMiddleware } from "@/honoMiddlewares/analyticsMiddleware.js";
import { publicCheckoutRouter } from "@/internal/checkouts/checkoutRouter.js";
import { publicDevRouter } from "@/internal/dev/devRouter.js";
import { publicTrmnlRouter } from "@/internal/misc/trmnl/trmnlRouter.js";
import type { HonoEnv } from "../honoUtils/HonoEnv.js";
import { publicInvoiceRouter } from "../internal/invoices/invoiceRouter.js";

export const publicRouter = new Hono<HonoEnv>();
publicRouter.use(analyticsMiddleware);
publicRouter.route("/checkouts", publicCheckoutRouter);
publicRouter.route("/invoices", publicInvoiceRouter);
publicRouter.route("/dev", publicDevRouter);
publicRouter.route("/trmnl", publicTrmnlRouter);
