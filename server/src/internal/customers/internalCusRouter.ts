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
  productToCusProduct,
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
import { cusProductToProduct } from "@autumn/shared";
import { createOrgResponse, isStripeConnected } from "../orgs/orgUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CusSearchService } from "./CusSearchService.js";
import { CusBatchService } from "../api/batch/CusBatchService.js";
import { ACTIVE_STATUSES } from "./cusProducts/CusProductService.js";

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

// Customer page
cusRouter.get("/:customer_id", async (req: any, res: any) => {
  try {
    const { db, org, features, env } = req;
    const { customer_id } = req.params;
    const orgId = req.orgId;

    const fullCus = await CusService.getFull({
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
    });

    res.status(200).json({
      customer: fullCus,
      // products: getLatestProducts(products),
      // versionCounts: getProductVersionCounts(products),
      // invoices,
      // features,
      // coupons,
      // events,
      // discount,
      // org,
      // entities,
    });
  } catch (error) {
    handleFrontendReqError({ req, error, res, action: "get customer data" });
  }
});

cusRouter.get("/:customer_id/events", async (req: any, res: any) => {
  try {
    const { db, org, features, env } = req;
    const { customer_id } = req.params;
    const orgId = req.orgId;

    const customer = await CusService.get({
      db,
      orgId,
      env,
      idOrInternalId: customer_id,
    });

    if (!customer) {
      throw new RecaseError({
        message: "Customer not found",
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const events = await EventService.getByCustomerId({
      db,
      internalCustomerId: customer.internal_id,
      env,
      orgId: orgId,
    });

    res.status(200).json({ events });
  } catch (error) {
    handleFrontendReqError({ req, error, res, action: "get customer events" });
  }
});

cusRouter.get("/:customer_id/referrals", async (req: any, res: any) => {
  try {
    const { env, db, org } = req;
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
    let [referred, redeemed, stripeCus] = await Promise.all([
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
      async () => {
        if (isStripeConnected({ org, env }) && internalCustomer.processor?.id) {
          const stripeCli = createStripeCli({ org, env });
          const stripeCus: any = await stripeCli.customers.retrieve(
            internalCustomer.processor.id
          );
          return stripeCus;
        }
        return null;
      },
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

    const end = performance.now();

    res.status(200).send({
      referred,
      redeemed,
      stripeCus,
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

cusRouter.post("/all/full_customers", async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "get customer full customers",
    handler: async (req, res) => {
      const { db, org, env } = req;
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

      const fullCustomers = await CusBatchService.getByInternalIds({
        db,
        org,
        env,
        internalCustomerIds: customers.map(
          (customer: any) => customer.internal_id
        ),
      });

      res.status(200).json({ fullCustomers });
    },
  })
);

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

      let cusProduct = productToCusProduct({
        cusProducts,
        productId: product_id,
        internalEntityId: entity?.internal_id,
        version: version ? parseInt(version) : undefined,
        cusProductId: customer_product_id,
        inStatuses: ACTIVE_STATUSES,
      });

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
      // let numVersions = await ProductService.getProductVersionCount({
      //   db,
      //   orgId: org.id,
      //   env,
      //   productId: product_id,
      // });

      res.status(200).json({
        cusProduct,
        product: productV2,
        // customer,
        // product: cusProduct
        //   ? {
        //       ...productV2,
        //       options: cusProduct.options,
        //       isActive: cusProduct.status === CusProductStatus.Active,
        //       isCustom: cusProduct.is_custom,
        //       isCanceled:
        //         cusProduct.canceled_at !== null || cusProduct.canceled,
        //       cusProductId: cusProduct.id,
        //     }
        //   : productV2,
        // features,
        // numVersions,
        // entities: customer.entities,
        // org: createOrgResponse({ org, env }),
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
