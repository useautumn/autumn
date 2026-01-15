import { Hono } from "hono";
import { publicTrmnlRouter } from "@/internal/api/trmnl/trmnlRouter.js";
import { publicDevRouter } from "@/internal/dev/devRouter.js";
import type { HonoEnv } from "../honoUtils/HonoEnv.js";
import { publicInvoiceRouter } from "../internal/invoices/invoiceRouter.js";

export const publicRouter = new Hono<HonoEnv>();
publicRouter.route("/invoices", publicInvoiceRouter);
publicRouter.route("/dev", publicDevRouter);
publicRouter.route("/trmnl", publicTrmnlRouter);
