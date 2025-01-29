import { Router } from "express";
import { CusService } from "./CusService.js";
import { ProductService } from "../products/ProductService.js";
import { InvoiceService } from "./invoices/InvoiceService.js";
import { FeatureService } from "../features/FeatureService.js";
import { getBillingType } from "../prices/priceUtils.js";
import {
  BillingType,
  Entitlement,
  EntitlementWithFeature,
  FeatureOptions,
  FullCustomerEntitlement,
  FullCustomerPrice,
} from "@autumn/shared";
import { handleRequestError } from "@/utils/errorUtils.js";

export const cusRouter = Router();

cusRouter.get("", async (req: any, res: any) => {
  const page = parseInt(req.query.page as string) || 1;
  const { data: customers, count } = await CusService.getCustomers(
    req.sb,
    req.org.id,
    req.env,
    page
  );

  res.status(200).send({ customers, totalCount: count });
});

cusRouter.post("/search", async (req: any, res: any) => {
  const { sb, org, env } = req;
  const { search, page } = req.body;

  const pageInt = parseInt(page as string) || 1;
  const cleanedQuery = search ? search.trim().toLowerCase() : "";

  try {
    const { data: customers, count } = await CusService.searchCustomers({
      sb,
      orgId: org.id,
      env,
      search: cleanedQuery,
      page: pageInt,
    });

    // console.log("customers", customers);
    res.status(200).send({ customers, totalCount: count });
  } catch (error) {
    handleRequestError({ res, error, action: "search customers" });
  }
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

    for (const product of customer.products) {
      product.entitlements = product.customer_entitlements.map(
        (cusEnt: FullCustomerEntitlement) => {
          return cusEnt.entitlement;
        }
      );
      product.prices = product.customer_prices.map(
        (cusPrice: FullCustomerPrice) => {
          return cusPrice.price;
        }
      );
    }

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
