import { createStripeCli } from "@/external/stripe/utils.js";

import { OrgService } from "@/internal/orgs/OrgService.js";
import { handleRequestError } from "@/utils/errorUtils.js";
import { Router } from "express";

export const invoiceRouter = Router();

invoiceRouter.get("/:stripe_invoice_id/stripe", async (req: any, res: any) => {
  try {
    const org = await OrgService.getFromReq(req);

    const stripeCli = createStripeCli({ org, env: req.env });

    const stripeInvoice = await stripeCli.invoices.retrieve(
      req.params.stripe_invoice_id,
    );

    res.status(200).json(stripeInvoice);
  } catch (error) {
    handleRequestError({ req, error, res, action: "Get invoice" });
  }
});
