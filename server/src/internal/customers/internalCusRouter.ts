import { Router } from "express";
import { CusService } from "./CusService.js";
import { ProductService } from "../products/ProductService.js";
import { InvoiceService } from "./invoices/InvoiceService.js";
import { FeatureService } from "../features/FeatureService.js";
import { FullCustomerEntitlement, FullCustomerPrice } from "@autumn/shared";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { CouponService } from "../coupons/CouponService.js";
import { EventService } from "../api/events/EventService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "../orgs/OrgService.js";

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
    // Get customer invoices
    const [org, features, coupons, products, events, customer] =
      await Promise.all([
        OrgService.getFromReq(req),
        FeatureService.getFromReq(req),
        CouponService.getAll({
          sb,
          orgId: orgId,
          env,
        }),

        ProductService.getFullProducts({ sb, orgId, env }),
        EventService.getByCustomerId({
          sb,
          customerId: customer_id,
          env,
          orgId: orgId,
          limit: 10,
        }),
        CusService.getFullCustomer({
          sb,
          orgId,
          env,
          customerId: customer_id,
        }),
      ]);
    if (!customer) {
      throw new RecaseError({
        message: "Customer not found",
        code: "CUSTOMER_NOT_FOUND",
      });
    }

    const invoices = await InvoiceService.getByInternalCustomerId({
      sb,
      internalCustomerId: customer_id,
      limit: 10,
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

    let discount = null;
    if (org.stripe_config && customer.processor?.id) {
      try {
        const stripeCli = createStripeCli({ org, env });
        const stripeCus: any = await stripeCli.customers.retrieve(
          customer.processor.id
        );

        if (stripeCus.discount) {
          discount = stripeCus.discount;
        }
      } catch (error) {
        console.log("error", error);
      }
    }
    res.status(200).send({
      customer,
      products,
      invoices,
      features,
      coupons,
      events,
      discount,
      org,
    });
  } catch (error) {
    handleRequestError({ req, error, res, action: "get customer data" });
  }
});
