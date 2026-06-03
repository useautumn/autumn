import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateInvoiceTemplate } from "./handlers/handleCreateInvoiceTemplate.js";
import { handleDeleteInvoiceTemplate } from "./handlers/handleDeleteInvoiceTemplate.js";
import { handleListInvoiceTemplates } from "./handlers/handleListInvoiceTemplates.js";
import { handleUpdateInvoiceTemplate } from "./handlers/handleUpdateInvoiceTemplate.js";

export const invoiceTemplateRouter = new Hono<HonoEnv>();

invoiceTemplateRouter.get("", ...handleListInvoiceTemplates);
invoiceTemplateRouter.post("", ...handleCreateInvoiceTemplate);
invoiceTemplateRouter.patch("/:id", ...handleUpdateInvoiceTemplate);
invoiceTemplateRouter.delete("/:id", ...handleDeleteInvoiceTemplate);
