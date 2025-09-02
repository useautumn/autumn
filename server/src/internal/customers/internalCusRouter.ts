import { Router } from "express";
import { CusService } from "./CusService.js";
import { ProductService } from "../products/ProductService.js";

import {
  CusExpand,
  CusProductStatus,
  ErrCode,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
} from "@autumn/shared";

import RecaseError, { handleFrontendReqError } from "@/utils/errorUtils.js";
import { RewardService } from "../rewards/RewardService.js";
import { EventService } from "../api/events/EventService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getLatestProducts } from "../products/productUtils.js";
import { getProductVersionCounts } from "../products/productUtils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { mapToProductV2 } from "../products/productV2Utils.js";
import { RewardRedemptionService } from "../rewards/RewardRedemptionService.js";
import { CusReadService } from "./CusReadService.js";
import { StatusCodes } from "http-status-codes";
import { cusProductToProduct } from "./cusProducts/cusProductUtils/convertCusProduct.js";
import { createOrgResponse } from "../orgs/orgUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CusSearchService } from "./CusSearchService.js";

export const cusRouter: Router = Router();

cusRouter.post("/all/search", (req, res) =>
  routeHandler({
    req,
    res,
    action: "search customers",
    handler: async (req, res) => {
      const { search, page_size = 50, page = 1, last_item, filters } = req.body;

      const { data: customers, count } = await CusSearchService.search({
        db: req.db,
        orgId: req.orgId,
        env: req.env,
        search,
        filters,
        lastItem: last_item,
        pageNumber: page,
        pageSize: page_size,
      });

      res.status(200).json({ customers, totalCount: Number(count) });
    },
  })
);

cusRouter.get("/:customer_id/events", async (req: any, res: any) => {
  try {
    const { db, org, features, env } = req;
    const { customer_id } = req.params;
    const orgId = req.orgId;
    const limit = req.query.limit || 10;
    const period = req.query.period || "all";

    const events = await EventService.getByCustomerId({
      db,
      internalCustomerId: customer_id,
      env,
      orgId: orgId,
      limit,
    });

    res.status(200).json({ events });
  } catch (error) {
    handleFrontendReqError({ req, error, res, action: "get customer events" });
  }
});

cusRouter.get("/:customer_id/data", async (req: any, res: any) => {
  try {
    const { db, org, features, env } = req;
    const { customer_id } = req.params;
    const orgId = req.orgId;

    const [coupons, products, customer] = await Promise.all([
      RewardService.list({
        db,
        orgId: orgId,
        env,
      }),

      ProductService.listFull({ db, orgId, env, returnAll: true }),
      CusService.getFull({
        db,
        orgId,
        env,
        idOrInternalId: customer_id,
        withEntities: true,
        expand: [CusExpand.Invoices],
        inStatuses: [
          CusProductStatus.Active,
          CusProductStatus.PastDue,
          CusProductStatus.Scheduled,
          CusProductStatus.Expired,
        ],
      }),
    ]);

    if (!customer) {
      throw new RecaseError({
        message: "Customer not found",
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    let invoices = customer.invoices;
    let entities = customer.entities;
    const events = await EventService.getByCustomerId({
      db,
      internalCustomerId: customer.internal_id,
      env,
      orgId: orgId,
      limit: 10,
    });

    let fullCustomer = customer as any;
    let cusProducts = fullCustomer.customer_products;
    fullCustomer.products = fullCustomer.customer_products;
    fullCustomer.entitlements = cusProducts.flatMap(
      (product: FullCusProduct) => product.customer_entitlements
    );
    fullCustomer.prices = cusProducts.flatMap(
      (product: FullCusProduct) => product.customer_prices
    );

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

    for (const invoice of invoices || []) {
      invoice.product_ids = invoice.product_ids.sort();
      invoice.internal_product_ids = invoice.internal_product_ids.sort();
    }

    // fullCustomer.entitlements = fullCustomer.entitlements.sort(
    //   (a: any, b: any) => {
    //     const productA = fullCustomer.products.find(
    //       (p: any) => p.id === a.customer_product_id
    //     );
    //     const productB = fullCustomer.products.find(
    //       (p: any) => p.id === b.customer_product_id
    //     );

    //     return (
    //       new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ||
    //       b.id.localeCompare(a.id)
    //     );
    //   }
    // );

    // for (const cusEnt of fullCustomer.entitlements) {
    //   // let entitlement = cusEnt.entitlement;

    //   // Show used, limit, etc.
    //   let { balance, unused } = getCusEntMasterBalance({
    //     cusEnt,
    //     entities,
    //   });

    //   cusEnt.balance = balance;
    //   cusEnt.unused = unused;
    // }

    res.status(200).json({
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
    handleFrontendReqError({ req, error, res, action: "get customer data" });
  }
});

cusRouter.get("/:customer_id/referrals", async (req: any, res: any) => {
  try {
    const { env, db } = req;
    const { customer_id } = req.params;
    const orgId = req.orgId;

    let internalCustomer = await CusService.get({
      db,
      orgId,
      env,
      idOrInternalId: customer_id,
    });

    if (!internalCustomer) {
      throw new RecaseError({
        message: "Customer not found",
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    // Get all redemptions for this customer
    let [referred, redeemed] = await Promise.all([
      RewardRedemptionService.getByReferrer({
        db,
        internalCustomerId: internalCustomer.internal_id,
        withCustomer: true,
        limit: 100,
      }),
      RewardRedemptionService.getByCustomer({
        db,
        internalCustomerId: internalCustomer.internal_id,
        withReferralCode: true,
        limit: 100,
      }),
    ]);

    let redeemedCustomerIds = redeemed.map(
      (redemption: any) => redemption.referral_code.internal_customer_id
    );

    let redeemedCustomers = await CusReadService.getInInternalIds({
      db,
      internalIds: redeemedCustomerIds,
    });

    for (const redemption of redeemed) {
      if (redemption.referral_code) {
        redemption.referral_code.customer = redeemedCustomers.find(
          (customer: any) =>
            customer.internal_id ===
            redemption.referral_code!.internal_customer_id
        );
      }
    }

    res.status(200).send({
      referred,
      redeemed,
    });
  } catch (error) {
    handleFrontendReqError({
      req,
      error,
      res,
      action: "get customer referrals",
    });
  }
});

cusRouter.get(
  "/:customer_id/product/:product_id",
  async (req: any, res: any) => {
    try {
      const { org, env, db, features, logtail: logger } = req;
      const { customer_id, product_id } = req.params;
      const { version, customer_product_id, entity_id } = req.query;

      const customer = await CusService.getFull({
        db,
        orgId: org.id,
        env,
        idOrInternalId: customer_id,
        withEntities: true,
        entityId: entity_id,
        inStatuses: [
          CusProductStatus.Active,
          CusProductStatus.PastDue,
          CusProductStatus.Scheduled,
          CusProductStatus.Expired,
        ],
      });

      if (!customer) {
        throw new RecaseError({
          message: "Customer not found",
          code: "CUSTOMER_NOT_FOUND",
          statusCode: StatusCodes.NOT_FOUND,
        });
      }

      let cusProducts = customer.customer_products;
      let entity = customer.entity;
      let cusProduct;

      if (notNullish(customer_product_id)) {
        cusProduct = cusProducts.find(
          (p: any) =>
            p.id === customer_product_id &&
            (entity ? p.internal_entity_id === entity.internal_id : true)
        );
      } else if (notNullish(version)) {
        cusProduct = cusProducts.find(
          (p: any) =>
            p.product.id === product_id &&
            (p.status === CusProductStatus.Active ||
              p.status === CusProductStatus.PastDue) &&
            p.product.version === parseInt(version) &&
            (entity ? p.internal_entity_id === entity.internal_id : true)
        );
      } else {
        cusProduct = cusProducts.find(
          (p: any) =>
            p.product.id === product_id &&
            (p.status === CusProductStatus.Active ||
              p.status === CusProductStatus.PastDue) &&
            (entity
              ? p.internal_entity_id === entity.internal_id
              : nullish(p.internal_entity_id))
        );
      }

      let product = cusProduct
        ? cusProductToProduct({ cusProduct })
        : await ProductService.getFull({
            db,
            orgId: org.id,
            env,
            idOrInternalId: product_id,
            version:
              version && Number.isInteger(parseInt(version))
                ? parseInt(version)
                : undefined,
          });

      let productV2 = mapToProductV2({ product: product!, features });

      let numVersions = await ProductService.getProductVersionCount({
        db,
        orgId: org.id,
        env,
        productId: product_id,
      });

      res.status(200).json({
        customer,
        // preview,
        product: cusProduct
          ? {
              ...productV2,
              options: cusProduct.options,
              isActive: cusProduct.status === CusProductStatus.Active,
              isCustom: cusProduct.is_custom,
              isCanceled:
                cusProduct.canceled_at !== null || cusProduct.canceled,
              cusProductId: cusProduct.id,
            }
          : productV2,
        features,
        numVersions,
        entities: customer.entities,
        org: createOrgResponse({ org, env }),
      });
    } catch (error) {
      handleFrontendReqError({
        req,
        error,
        res,
        action: "get customer product",
      });
    }
  }
);

cusRouter.get("/:customer_id/sub", async (req: any, res: any) => {
  try {
    const { org, env, db } = req;
    const { customer_id } = req.params;
    const orgId = req.orgId;

    const fullCus = await CusService.getFull({
      db,
      orgId,
      env,
      idOrInternalId: customer_id,
    });

    const subId = fullCus.customer_products.flatMap(
      (cp: FullCusProduct) => cp.subscription_ids || []
    )?.[0];

    if (!subId) {
      throw new RecaseError({
        message: "Customer has no active subscription",
        code: "CUSTOMER_NO_ACTIVE_SUBSCRIPTION",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const stripeCli = createStripeCli({ org, env });
    const sub = await stripeCli.subscriptions.retrieve(subId, {
      expand: ["discounts.coupon"],
    });

    res.status(200).json({ sub });
  } catch (error) {
    handleFrontendReqError({ req, error, res, action: "get customer rewards" });
  }
});
