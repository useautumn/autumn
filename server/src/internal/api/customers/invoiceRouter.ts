import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { handleRequestError } from "@/utils/errorUtils.js";
import { Router } from "express";

export const invoiceRouter = Router();

invoiceRouter.get("/:invoice_id", async (req: any, res: any) => {
  try {
    const invoiceId = req.params.invoice_id;
    const invoice = await InvoiceService.getById({
      sb: req.sb,
      id: invoiceId,
    });

    res.status(200).json(invoice);
  } catch (error) {
    handleRequestError({ req, error, res, action: "Get invoice" });
  }
});
