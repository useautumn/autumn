import { Router } from "express";
import RecaseError from "@/utils/errorUtils.js";
import { APIVersion, BillingType, FullCusProduct } from "@autumn/shared";
import { ErrCode } from "@/errors/errCodes.js";
import {
  createStripeCusIfNotExists,
  getCusPaymentMethod,
} from "@/external/stripe/stripeCusUtils.js";

import {
  getBillingType,
  getEntOptions,
  getPriceEntitlement,
  getProductForPrice,
  priceIsOneOffAndTiered,
} from "@/internal/products/prices/priceUtils.js";

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
import { orgToVersion } from "@/utils/versionUtils.js";

// import { handleExistingProduct } from "@/internal/customers/add-product/handleExistingProduct.js";

import { handleAttachRaceCondition } from "@/external/redis/redisUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { AttachBodySchema } from "./models/AttachBody.js";
import { processAttachBody } from "./attachUtils/attachParams/processAttachBody.js";
import { handleAttachPreview } from "./handleAttachPreview/handleAttachPreview.js";
import { handleAttach } from "./handleAttach.js";

export const attachRouter: Router = Router();

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
    // createStripeCusIfNotExists({
    //   db: req.db,
    //   org,
    //   env,
    //   customer,
    //   logger,
    // }),
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
  const { prices, entitlements, products, org, stripeCli } = attachParams;

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
    stripeCli: createStripeCli({
      org: attachParams.org,
      env: attachParams.customer.env,
    }),
    stripeId: attachParams.customer.processor?.id,
  });

  return notNullOrUndefined(paymentMethod) ? true : false;
};

const handleAttachOld = async (req: any, res: any) =>
  routeHandler({
    action: "attach",
    req,
    res,
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      await handleAttachRaceCondition({ req, res });

      const attachBody = AttachBodySchema.parse(req.body);
      const logger = req.logtail;

      // PUBLIC STUFF
      let forceCheckout = req.isPublic || attachBody.force_checkout || false;
      let isCustom = attachBody.is_custom || false;
      if (req.isPublic) {
        isCustom = false;
      }

      logger.info("--------------------------------");

      const {
        customer,
        products,
        optionsList,
        prices,
        entitlements,
        freeTrial,
      } = await processAttachBody({
        req,
        attachBody,
      });

      const apiVersion =
        orgToVersion({
          org: req.org,
          reqApiVersion: req.apiVersion,
        }) || APIVersion.v1;

      const internalEntityId = attachBody.entity_id
        ? customer.entities.find(
            (e) =>
              e.id === attachBody.entity_id ||
              e.internal_id === attachBody.entity_id,
          )?.internal_id
        : undefined;

      const stripeCli = createStripeCli({ org: req.org, env: req.env });
      const paymentMethod = await getCusPaymentMethod({
        stripeCli,
        stripeId: customer.processor?.id,
      });

      // const attachParams: AttachParams = {
      //   stripeCli,
      //   paymentMethod,

      //   customer,
      //   products,
      //   optionsList,
      //   prices,
      //   entitlements,
      //   freeTrial,

      //   // From req
      //   req,
      //   org: req.org,
      //   entities: customer.entities,
      //   features: req.features,
      //   internalEntityId,
      //   cusProducts: customer.customer_products,

      //   // Others
      //   apiVersion,
      //   successUrl: attachBody.success_url,
      //   invoiceOnly: attachBody.invoice_only,
      //   billingAnchor: attachBody.billing_cycle_anchor,
      //   metadata: attachBody.metadata,
      //   disableFreeTrial: attachBody.free_trial === false || false,
      //   checkoutSessionParams: attachBody.checkout_session_params,
      //   isCustom,
      // };

      // attachParams.apiVersion =
      //   orgToVersion({
      //     org,
      //     reqApiVersion: req.apiVersion,
      //   }) || APIVersion.v1;

      // attachParams.req = req;
      // attachParams.successUrl = attachBody.success_url;
      // attachParams.invoiceOnly = attachBody.invoice_only;
      // attachParams.billingAnchor = attachBody.billing_cycle_anchor;
      // attachParams.metadata = attachBody.metadata;
      // attachParams.isCustom = isCustom || false;
      // attachParams.disableFreeTrial = attachBody.free_trial === false || false;
      // attachParams.checkoutSessionParams = checkout_session_params;

      // logger.info(
      //   `Customer: ${chalk.yellow(
      //     `${attachParams.customer.id} (${attachParams.customer.name})`,
      //   )}, Products: ${chalk.yellow(
      //     attachParams.products.map((p) => p.id).join(", "),
      //   )}`,
      // );

      // // 3. Check for stripe connection
      // await checkStripeConnections({ req, attachParams });
      // let hasPm = await customerHasPm({ attachParams });
      // const useCheckout = !hasPm || forceCheckout;
      // await createStripePrices({
      //   attachParams,
      //   useCheckout,
      //   req,
      //   logger,
      // });

      // logger.info(
      //   `Has PM: ${chalk.yellow(hasPm)}, Force Checkout: ${chalk.yellow(
      //     forceCheckout,
      //   )}`,
      // );
      // logger.info(
      //   `Use Checkout: ${chalk.yellow(useCheckout)}, Is Custom: ${chalk.yellow(
      //     isCustom,
      //   )}, Invoice Only: ${chalk.yellow(invoiceOnly)}`,
      //   {
      //     details: { hasPm, forceCheckout, useCheckout, isCustom, invoiceOnly },
      //   },
      // );

      // -------------------- ERROR CHECKING --------------------

      // 1. Check for normal errors (eg. options, different recurring intervals)

      // const { curCusProduct, done } = await handleExistingProduct({
      //   req,
      //   res,
      //   attachParams,
      //   useCheckout,
      //   invoiceOnly: attachBody.invoice_only,
      //   isCustom,
      // });

      // await handlePrepaidErrors({
      //   attachParams,
      //   useCheckout,
      // });

      // await handlePublicAttachErrors({
      //   curCusProduct,
      //   isPublic: req.isPublic || false,
      // });

      // if (done) return;

      // // -------------------- ATTACH PRODUCT --------------------

      // SCENARIO 1: Free product, no existing product
      // const newProductsFree = isFreeProduct(attachParams.prices);
      // const allAddOns = attachParams.products.every((p) => p.is_add_on);

      // if (
      //   (!curCusProduct && newProductsFree) ||
      //   (allAddOns && newProductsFree)
      // ) {
      //   logger.info("SCENARIO 1: FREE PRODUCT");

      // if (useCheckout && !newProductsFree && !attachParams.invoiceOnly) {
      //   logger.info("SCENARIO 2: USING CHECKOUT");
      //   await handleCreateCheckout({
      //     req,
      //     res,
      //     attachParams,
      //   });
      //   return;
      // }

      // // SCENARIO 4: Switching product
      // if (curCusProduct) {
      //   logger.info("SCENARIO 3: SWITCHING PRODUCT");
      //   await handleChangeProduct({
      //     req,
      //     res,
      //     attachParams,
      //     curCusProduct,
      //   });
      //   return;
      // }

      // SCENARIO 5: No existing product, not free product
      // logger.info("SCENARIO 4: ADDING PRODUCT");
      // await handleAddProduct({
      //   req,
      //   res,
      //   attachParams,
      // });
    },
  });

attachRouter.post("", handleAttach);
attachRouter.post("/preview", handleAttachPreview);
