import { Router } from "express";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { z } from "zod";
import {
  APIVersion,
  BillingType,
  FeatureOptions,
  FeatureOptionsSchema,
  FullCusProduct,
  ProductItem,
  ProductItemSchema,
} from "@autumn/shared";
import { ErrCode } from "@/errors/errCodes.js";
import {
  createStripeCusIfNotExists,
  getCusPaymentMethod,
} from "@/external/stripe/stripeCusUtils.js";
import { handleAddProduct } from "@/internal/customers/add-product/handleAddProduct.js";

import {
  getBillingType,
  getEntOptions,
  getPriceEntitlement,
  getProductForPrice,
  priceIsOneOffAndTiered,
} from "@/internal/products/prices/priceUtils.js";

import { getFullCusProductData } from "@/internal/customers/cusProducts/attachUtils.js";
import {
  checkStripeProductExists,
  isFreeProduct,
} from "@/internal/products/productUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice.js";
import {
  notNullish,
  notNullOrUndefined,
  nullOrUndefined,
} from "@/utils/genUtils.js";
import chalk from "chalk";

import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { orgToVersion } from "@/utils/versionUtils.js";

import { handleExistingProduct } from "@/internal/customers/add-product/handleExistingProduct.js";
import { handleAddFreeProduct } from "@/internal/customers/add-product/handleAddFreeProduct.js";
import { handleCreateCheckout } from "@/internal/customers/add-product/handleCreateCheckout.js";
import { handleChangeProduct } from "@/internal/customers/change-product/handleChangeProduct.js";
import { handleAttachRaceCondition } from "@/external/redis/redisUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { AttachBodySchema } from "./models/AttachBody.js";

export const attachRouter = Router();

export const handlePrepaidErrors = async ({
  attachParams,
  useCheckout = false,
}: {
  attachParams: AttachParams;
  useCheckout?: boolean;
}) => {
  const { prices, entitlements, optionsList } = attachParams;

  // 2. Check if options are valid
  for (const price of prices) {
    const billingType = getBillingType(price.config!);

    if (billingType === BillingType.UsageInAdvance) {
      // Get options for price
      let priceEnt = getPriceEntitlement(price, entitlements);
      let options = getEntOptions(optionsList, priceEnt);

      // 1. If not checkout, quantity should be defined
      if (!useCheckout && nullOrUndefined(options?.quantity)) {
        throw new RecaseError({
          message: `Pass in 'quantity' for feature ${priceEnt.feature_id} in options`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }

      if (
        nullOrUndefined(options?.quantity) &&
        priceIsOneOffAndTiered(price, priceEnt)
      ) {
        throw new RecaseError({
          code: ErrCode.InvalidRequest,
          message:
            "Quantity is required for start of period price that is one off and tiered",
          statusCode: 400,
        });
      }

      // 3. Quantity cannot be negative
      if (notNullish(options?.quantity) && options?.quantity! < 0) {
        throw new RecaseError({
          message: `Quantity cannot be negative`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }

      // 4. If there's only one price, quantity must be greater than 0
      if (options?.quantity === 0 && prices.length === 1) {
        throw new RecaseError({
          message: `When there's only one price, quantity must be greater than 0`,
          code: ErrCode.InvalidOptions,
          statusCode: 400,
        });
      }
    }
  }
};

export const handlePublicAttachErrors = async ({
  curCusProduct,
  isPublic,
}: {
  curCusProduct: FullCusProduct | null;
  isPublic: boolean;
}) => {
  if (!isPublic) {
    return;
  }

  if (!curCusProduct) {
    return;
  }

  // 1. If on paid plan, not allowed to switch product
  const curProductFree = isFreeProduct(
    curCusProduct?.customer_prices.map((cp: any) => cp.price) || [], // if no current product...
  );

  if (!curProductFree) {
    throw new RecaseError({
      message: "Public attach: not allowed to upgrade / downgrade (from paid)",
      code: ErrCode.InvalidRequest,
      statusCode: 400,
    });
  }
};

export const checkStripeConnections = async ({
  req,
  attachParams,
}: {
  req: any;
  attachParams: AttachParams;
}) => {
  const { org, customer, products } = attachParams;
  const logger = req.logtail;
  const env = customer.env;

  if (!org.stripe_connected) {
    throw new RecaseError({
      message: "Please connect to Stripe to add products",
      code: ErrCode.StripeConfigNotFound,
      statusCode: 400,
    });
  }

  // 2. If invoice only and no email, save email
  if (attachParams.invoiceOnly && !customer.email) {
    customer.email = `${customer.id}@invoices.useautumn.com`;
    await CusService.update({
      db: req.db,
      internalCusId: customer.internal_id,
      update: {
        email: customer.email,
      },
    });
  }

  const batchProductUpdates = [
    createStripeCusIfNotExists({
      db: req.db,
      org,
      env,
      customer,
      logger,
    }),
  ];
  for (const product of products) {
    batchProductUpdates.push(
      checkStripeProductExists({
        db: req.db,
        org,
        env,
        product,
        logger,
      }),
    );
  }
  await Promise.all(batchProductUpdates);
};

export const createStripePrices = async ({
  attachParams,
  useCheckout,
  req,
  logger,
}: {
  attachParams: AttachParams;
  useCheckout: boolean;
  req: any;
  logger: any;
}) => {
  const { prices, entitlements, products, org, internalEntityId } =
    attachParams;

  const stripeCli = createStripeCli({ org, env: attachParams.customer.env });

  const batchPriceUpdates = [];
  for (const price of prices) {
    let product = getProductForPrice(price, products);

    batchPriceUpdates.push(
      createStripePriceIFNotExist({
        db: req.db,
        stripeCli,
        price,
        entitlements,
        product: product!,
        org,
        logger,
        internalEntityId: attachParams.internalEntityId,
        useCheckout,
      }),
    );
  }
  await Promise.all(batchPriceUpdates);
};

export const customerHasPm = async ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  // SCENARIO 3: No payment method, checkout required
  const paymentMethod = await getCusPaymentMethod({
    org: attachParams.org,
    env: attachParams.customer.env,
    stripeId: attachParams.customer.processor.id,
  });

  return notNullOrUndefined(paymentMethod) ? true : false;
};

const handleAttachNew = async (req: ExtendedRequest, res: ExtendedResponse) => {
  const params = AttachBodySchema.parse(req.body);
  await handleAttachRaceCondition({ req, res });
};

attachRouter.post("", async (req: any, res: any) =>
  routeHandler({
    action: "attach",
    req,
    res,
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const params = AttachBodySchema.parse(req.body);
      await handleAttachRaceCondition({ req, res });

      const {
        customer_id,
        customer_data,
        entity_id,
        entity_data,

        product_id,
        product_ids,

        options,

        is_custom,
        items,
        free_trial,

        version,
        success_url,
        force_checkout,
        invoice_only,
        metadata,
        billing_cycle_anchor,
        checkout_session_params,
      } = req.body;

      const { env } = req;
      const logger = req.logtail;

      let itemsInput: ProductItem[] = items || [];

      const optionsListInput: FeatureOptions[] = options || [];

      const invoiceOnly = invoice_only || false;
      const successUrl = success_url || undefined;
      const disableFreeTrial = free_trial === false || false;

      // PUBLIC STUFF
      let forceCheckout = req.isPublic || force_checkout || false;
      let isCustom = is_custom || false;
      if (req.isPublic) {
        isCustom = false;
      }

      logger.info("--------------------------------");
      let publicStr = req.isPublic ? "(Public) " : "";
      logger.info(
        `${publicStr}ATTACH PRODUCT REQUEST (from ${req.minOrg.slug})`,
      );

      z.array(FeatureOptionsSchema).parse(optionsListInput);

      let [org, features] = await Promise.all([
        OrgService.getFromReq(req),
        FeatureService.getFromReq(req),
      ]);

      // Get curCusProducts too...
      const attachParams: AttachParams = await getFullCusProductData({
        req,
        db: req.db,
        customerId: customer_id,
        productId: product_id,
        entityId: entity_id,
        customerData: customer_data,
        org,
        features,
        env,
        itemsInput,
        optionsListInput,
        freeTrialInput: free_trial,
        isCustom,
        productIds: product_ids,
        logger,
        version,
        entityData: entity_data,
      });

      attachParams.apiVersion =
        orgToVersion({
          org,
          reqApiVersion: req.apiVersion,
        }) || APIVersion.v1;

      attachParams.req = req;
      attachParams.successUrl = successUrl;
      attachParams.invoiceOnly = invoiceOnly;
      attachParams.billingAnchor = billing_cycle_anchor;
      attachParams.metadata = metadata;
      attachParams.isCustom = isCustom || false;
      attachParams.disableFreeTrial = disableFreeTrial;
      attachParams.checkoutSessionParams = checkout_session_params;

      logger.info(
        `Customer: ${chalk.yellow(
          `${attachParams.customer.id} (${attachParams.customer.name})`,
        )}, Products: ${chalk.yellow(
          attachParams.products.map((p) => p.id).join(", "),
        )}`,
      );

      // 3. Check for stripe connection
      await checkStripeConnections({ req, attachParams });
      let hasPm = await customerHasPm({ attachParams });
      const useCheckout = !hasPm || forceCheckout;
      await createStripePrices({
        attachParams,
        useCheckout,
        req,
        logger,
      });

      logger.info(
        `Has PM: ${chalk.yellow(hasPm)}, Force Checkout: ${chalk.yellow(
          forceCheckout,
        )}`,
      );
      logger.info(
        `Use Checkout: ${chalk.yellow(useCheckout)}, Is Custom: ${chalk.yellow(
          isCustom,
        )}, Invoice Only: ${chalk.yellow(invoiceOnly)}`,
        {
          details: { hasPm, forceCheckout, useCheckout, isCustom, invoiceOnly },
        },
      );

      // -------------------- ERROR CHECKING --------------------

      // 1. Check for normal errors (eg. options, different recurring intervals)

      const { curCusProduct, done } = await handleExistingProduct({
        req,
        res,
        attachParams,
        useCheckout,
        invoiceOnly,
        isCustom,
      });

      await handlePrepaidErrors({
        attachParams,
        useCheckout,
      });

      await handlePublicAttachErrors({
        curCusProduct,
        isPublic: req.isPublic || false,
      });

      if (done) return;

      // // -------------------- ATTACH PRODUCT --------------------

      // SCENARIO 1: Free product, no existing product
      const newProductsFree = isFreeProduct(attachParams.prices);
      const allAddOns = attachParams.products.every((p) => p.is_add_on);

      if (
        (!curCusProduct && newProductsFree) ||
        (allAddOns && newProductsFree)
      ) {
        logger.info("SCENARIO 1: FREE PRODUCT");
        await handleAddFreeProduct({
          req,
          res,
          attachParams,
        });
        return;
      }

      if (useCheckout && !newProductsFree && !invoiceOnly) {
        logger.info("SCENARIO 2: USING CHECKOUT");
        await handleCreateCheckout({
          db: req.db,
          req,
          res,
          attachParams,
        });
        return;
      }

      // SCENARIO 4: Switching product
      if (curCusProduct) {
        logger.info("SCENARIO 3: SWITCHING PRODUCT");
        await handleChangeProduct({
          req,
          res,
          attachParams,
          curCusProduct,
        });
        return;
      }

      // SCENARIO 5: No existing product, not free product
      logger.info("SCENARIO 4: ADDING PRODUCT");
      await handleAddProduct({
        req,
        res,
        attachParams,
      });
    },
  }),
);
