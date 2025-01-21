import { Router } from "express";
import { CusService } from "./CusService.js";
import { ProductService } from "../products/ProductService.js";
import { InvoiceService } from "./invoices/InvoiceService.js";
import { FeatureService } from "../features/FeatureService.js";

export const cusRouter = Router();

cusRouter.get("", async (req: any, res: any) => {
  const customers = await CusService.getCustomers(req.sb, req.org.id, req.env);
  res.status(200).send({ customers });
});

cusRouter.get("/:customer_id/data", async (req: any, res: any) => {
  const { sb, org, env } = req;
  const { customer_id } = req.params;

  const orgId = req.orgId;

  try {
    const customer = await CusService.getFullCustomer({
      sb,
      orgId,
      env,
      customerId: customer_id,
    });

    // Get customer invoices
    const invoices = await InvoiceService.getInvoices({
      sb,
      internalCustomerId: customer.internal_id,
    });

    const features = await FeatureService.getFeatures({
      sb,
      orgId: org.id,
      env,
    });

    // Get all products for the org
    const products = await ProductService.getFullProducts(sb, org.id, env);

    res.status(200).send({ customer, products, invoices, features });
  } catch (error) {
    console.error("Failed to get customer data", error);
    res.status(500).send(error);
  }
});
