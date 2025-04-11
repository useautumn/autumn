import { Router } from "express";
import { CusService } from "./CusService.js";
import { ProductService } from "../products/ProductService.js";
import { InvoiceService } from "./invoices/InvoiceService.js";
import { FeatureService } from "../features/FeatureService.js";
import {
  CusProductStatus,
  ErrCode,
  FullCustomerEntitlement,
  FullCustomerPrice,
} from "@autumn/shared";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { RewardService } from "../rewards/RewardService.js";
import { EventService } from "../api/events/EventService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "../orgs/OrgService.js";
import { EntityService } from "../api/entities/EntityService.js";
import { getCusEntMasterBalance } from "./entitlements/cusEntUtils.js";
import { getLatestProducts } from "../products/productUtils.js";
import { getProductVersionCounts } from "../products/productUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { RewardRedemptionService } from "../rewards/RewardRedemptionService.js";
import { CusReadService } from "./CusReadService.js";

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
        RewardService.getAll({
          sb,
          orgId: orgId,
          env,
        }),

        ProductService.getFullProducts({ sb, orgId, env, returnAll: true }),
        EventService.getByCustomerId({
          sb,
          customerId: customer_id,
          env,
          orgId: orgId,
          limit: 10,
          fields: [
            "id",
            "event_name",
            "value",
            "timestamp",
            "idempotency_key",
            "properties",
            "set_usage",
            "entity_id",
          ],
        }),
        CusService.getByIdOrInternalId({
          sb,
          orgId,
          env,
          idOrInternalId: customer_id,
          isFull: true,
        }),
      ]);

    if (!customer) {
      throw new RecaseError({
        message: "Customer not found",
        code: "CUSTOMER_NOT_FOUND",
      });
    }

    const [invoices, entities] = await Promise.all([
      InvoiceService.getByInternalCustomerId({
        sb,
        internalCustomerId: customer.internal_id,
        limit: 10,
      }),
      EntityService.getByInternalCustomerId({
        sb,
        internalCustomerId: customer.internal_id,
        logger: req.logger,
      }),
    ]);

    let fullCustomer = customer as any;
    for (const product of fullCustomer.products) {
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

    // PROCESSING
    // 1. Invoice product ids sorted
    for (const invoice of invoices) {
      invoice.product_ids = invoice.product_ids.sort();
      invoice.internal_product_ids = invoice.internal_product_ids.sort();
    }

    // For each cus ent, show full entitlement?
    // Order full customer entitlements by created_at descending, then id
    fullCustomer.entitlements = fullCustomer.entitlements.sort(
      (a: any, b: any) => {
        // Sort by cusProduct created_at
        const productA = fullCustomer.products.find(
          (p: any) => p.id === a.customer_product_id
        );
        const productB = fullCustomer.products.find(
          (p: any) => p.id === b.customer_product_id
        );

        // new Date(productB.created_at).getTime() - new Date(productA.created_at).getTime() || productA.id.localeCompare(productB.id) ||
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ||
          b.id.localeCompare(a.id)
        );
      }
    );

    for (const cusEnt of fullCustomer.entitlements) {
      // let entitlement = cusEnt.entitlement;

      // Show used, limit, etc.
      let { balance, unused } = getCusEntMasterBalance({
        cusEnt,
        entities,
      });

      cusEnt.balance = balance;
      cusEnt.unused = unused;
    }

    res.status(200).send({
      customer: fullCustomer,
      products: getLatestProducts(products),
      versionCounts: getProductVersionCounts(products),
      invoices,
      features,
      coupons,
      events,
      discount,
      org,
      entities,
    });
  } catch (error) {
    handleRequestError({ req, error, res, action: "get customer data" });
  }
});

cusRouter.get("/:customer_id/referrals", async (req: any, res: any) => {
  try {
    const { sb, org, env } = req;
    const { customer_id } = req.params;
    const orgId = req.orgId;

    let internalCustomer = await CusService.getByIdOrInternalId({
      sb,
      orgId,
      env,
      idOrInternalId: customer_id,
      isFull: true,
    });

    // Get all redemptions for this customer
    let [referred, redeemed] = await Promise.all([
      RewardRedemptionService.getByReferrer({
        sb,
        internalCustomerId: internalCustomer.internal_id,
        withCustomer: true,
        limit: 100,
      }),
      RewardRedemptionService.getByCustomer({
        sb,
        internalCustomerId: internalCustomer.internal_id,
        withReferralCode: true,
        limit: 100,
      }),
    ]);

    let redeemedCustomerIds = redeemed.map(
      (redemption: any) => redemption.referral_code.internal_customer_id
    );

    let redeemedCustomers = await CusReadService.getInInternalIds({
      sb,
      internalIds: redeemedCustomerIds,
    });

    for (const redemption of redeemed) {
      redemption.referral_code.customer = redeemedCustomers.find(
        (customer: any) =>
          customer.internal_id === redemption.referral_code.internal_customer_id
      );
    }

    if (!internalCustomer) {
      throw new RecaseError({
        message: "Customer not found",
        code: ErrCode.CustomerNotFound,
      });
    }

    res.status(200).send({
      referred,
      redeemed,
    });
  } catch (error) {
    console.error("Error getting customer referrals", error);
    res.status(500).send({ error: "Error getting customer referrals" });
  }
});

cusRouter.get(
  "/:customer_id/product/:product_id",
  async (req: any, res: any) => {
    const { sb, org, env } = req;
    const { customer_id, product_id } = req.params;
    const version = req.query.version;
    const orgId = req.orgId;

    try {
      const customer = await CusService.getByIdOrInternalId({
        sb,
        orgId,
        env,
        idOrInternalId: customer_id,
        isFull: true,
      });

      const features = await FeatureService.getFeatures({
        sb,
        orgId,
        env,
      });

      if (!customer) {
        throw new RecaseError({
          message: "Customer not found",
          code: "CUSTOMER_NOT_FOUND",
        });
      }

      let cusProduct;

      if (notNullish(version)) {
        cusProduct = customer.products.find(
          (p: any) =>
            p.product.id === product_id &&
            p.status === CusProductStatus.Active &&
            p.product.version === parseInt(version)
        );
      } else {
        cusProduct = customer.products.find(
          (p: any) =>
            p.product.id === product_id && p.status === CusProductStatus.Active
        );
      }

      let product;

      if (cusProduct) {
        product = {
          ...cusProduct.product,
          entitlements: cusProduct.customer_entitlements.map(
            (ent: any) => ent.entitlement
          ),
          prices: cusProduct.customer_prices.map((price: any) => price.price),
          free_trial: cusProduct.free_trial,
          options: cusProduct.options,
          isActive: cusProduct.status === CusProductStatus.Active,
        };
      } else {
        product = await ProductService.getFullProduct({
          sb,
          orgId,
          env,
          productId: product_id,
          version:
            version && Number.isInteger(parseInt(version))
              ? parseInt(version)
              : undefined,
        });
      }

      let numVersions = await ProductService.getProductVersionCount({
        sb,
        orgId,
        env,
        productId: product_id,
      });

      // console.log("Product", product);

      res.status(200).send({ customer, product, features, numVersions });
    } catch (error) {
      handleRequestError({ req, error, res, action: "get customer product" });
    }
  }
);
