import { Router } from "express";
import { CusService } from "./CusService.js";
import { ProductService } from "../products/ProductService.js";
import { InvoiceService } from "./invoices/InvoiceService.js";
import { FeatureService } from "../features/FeatureService.js";
import { FullCustomerEntitlement, FullCustomerPrice } from "@autumn/shared";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";

export const cusRouter = Router();

cusRouter.get("", async (req: any, res: any) => {
  const page = parseInt(req.query.page as string) || 1;
  const { data: customers, count } = await CusService.getCustomers(
    req.sb,
    req.orgId,
    req.env,
    page
  );

  res.status(200).send({ customers, totalCount: count });
});

cusRouter.post("/search", async (req: any, res: any) => {
  const { pg, sb, orgId, env } = req;
  const { search, page, filters } = req.body;

  const pageInt = parseInt(page as string) || 1;
  const cleanedQuery = search ? search.trim().toLowerCase() : "";

  try {
    const { data: customers, count } = await CusService.searchCustomers({
      sb,
      pg,
      orgId: orgId,
      env,
      search: cleanedQuery,
      pageNumber: pageInt,
      filters,
    });

    // console.log("customers", customers);
    res.status(200).send({ customers, totalCount: count });
  } catch (error) {
    handleRequestError({ req, error, res, action: "search customers" });
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

    if (!customer) {
      throw new RecaseError({
        message: "Customer not found",
        code: "CUSTOMER_NOT_FOUND",
      });
    }

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
      orgId: orgId,
      env,
    });

    // Get all products for the org
    const products = await ProductService.getFullProducts(sb, orgId, env);

    res.status(200).send({ customer, products, invoices, features });
  } catch (error) {
    handleRequestError({ req, error, res, action: "get customer data" });
  }
});
