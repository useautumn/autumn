import {
  getBillingType,
  getPriceEntitlement,
  getPriceOptions,
  getProductForPrice,
  pricesOnlyOneOff,
  priceToAmountOrTiers,
} from "@/internal/products/prices/priceUtils.js";

import RecaseError from "@/utils/errorUtils.js";

import { createFullCusProduct } from "../../../add-product/createFullCusProduct.js";
import {
  createStripeCli,
  subToAutumnInterval,
} from "@/external/stripe/utils.js";
import {
  AttachParams,
  AttachResultSchema,
} from "../../../cusProducts/AttachParams.js";
import { getPriceAmount } from "@/internal/products/prices/priceUtils.js";
import {
  APIVersion,
  AttachConfig,
  AttachScenario,
  BillingInterval,
  BillingType,
  ErrCode,
  InvoiceItem,
  PriceType,
  UsageModel,
} from "@autumn/shared";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import {
  getInvoiceExpansion,
  getStripeExpandedInvoice,
  payForInvoice,
} from "@/external/stripe/stripeInvoiceUtils.js";

import { handleCreateCheckout } from "../../../add-product/handleCreateCheckout.js";
import { getStripeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import Stripe from "stripe";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { createStripeSub } from "@/external/stripe/stripeSubUtils/createStripeSub.js";
import {
  getAlignedIntervalUnix,
  getNextStartOfMonthUnix,
} from "@/internal/products/prices/billingIntervalUtils.js";
import { SuccessCode } from "@autumn/shared";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";

import { getInvoiceItems } from "@/internal/invoices/invoiceUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { attachParamToCusProducts } from "../../attachUtils/convertAttachParams.js";

export const handleBillNowPrices = async ({
  attachParams,
  res,
  req,
  fromRequest = true,
  carryExistingUsages = false,
  shouldPreview = false,
  disableMerge = false,
}: {
  attachParams: AttachParams;
  res: any;
  req: any;
  fromRequest?: boolean;
  carryExistingUsages?: boolean;
  shouldPreview?: boolean;
  disableMerge?: boolean;
}) => {
  const logger = req.logtail;
  let { org, customer, products, freeTrial, invoiceOnly, cusProducts } =
    attachParams;

  if (attachParams.disableFreeTrial) {
    freeTrial = null;
  }

  const stripeCli = createStripeCli({ org, env: customer.env });

  let itemSets = await getStripeSubItems({
    attachParams,
    carryExistingUsages,
  });

  let subscriptions: Stripe.Subscription[] = [];
  let invoiceIds: string[] = [];

  // Only merge if no free trials
  let mergeCusProduct =
    !disableMerge && !freeTrial && org.config.merge_billing_cycles
      ? cusProducts?.find((cp) =>
          products.some((p) => p.group == cp.product.group),
        )
      : undefined;

  let mergeSubs = await getStripeSubs({
    stripeCli,
    subIds: mergeCusProduct?.subscription_ids,
  });

  for (const itemSet of itemSets) {
    if (itemSet.interval === BillingInterval.OneOff) {
      continue;
    }

    let mergeWithSub = mergeSubs.find(
      (sub) => subToAutumnInterval(sub) == itemSet.interval,
    );

    let subscription;
    try {
      let billingCycleAnchorUnix;
      if (org.config.anchor_start_of_month) {
        billingCycleAnchorUnix = getNextStartOfMonthUnix(itemSet.interval);
      }

      if (attachParams.billingAnchor) {
        billingCycleAnchorUnix = getAlignedIntervalUnix({
          alignWithUnix: attachParams.billingAnchor,
          interval: itemSet.interval,
        });
      }

      if (mergeWithSub) {
        billingCycleAnchorUnix = mergeWithSub.current_period_end * 1000;
      }

      subscription = await createStripeSub({
        db: req.db,
        stripeCli,
        customer,
        org,
        freeTrial,
        invoiceOnly,
        itemSet,
        anchorToUnix: billingCycleAnchorUnix,
        shouldPreview,
      });

      if (shouldPreview) {
        return subscription;
      }

      let sub = subscription as Stripe.Subscription;

      subscriptions.push(sub);
      invoiceIds.push(sub.latest_invoice as string);
    } catch (error: any) {
      if (
        (error instanceof RecaseError &&
          !invoiceOnly &&
          (error.code === ErrCode.StripeCardDeclined ||
            error.code === ErrCode.CreateStripeSubscriptionFailed)) ||
        error.code === ErrCode.StripeGetPaymentMethodFailed
      ) {
        await handleCreateCheckout({
          req,
          res,
          attachParams,
        });
        return;
      }

      throw error;
    }
  }

  // Add product and entitlements to customer
  const batchInsert = [];

  for (const product of products) {
    batchInsert.push(
      createFullCusProduct({
        db: req.db,
        attachParams: attachToInsertParams(attachParams, product),
        subscriptionIds: subscriptions.map((s) => s.id),
        subscriptionId:
          subscriptions.length > 0 ? subscriptions[0].id : undefined,
        anchorToUnix:
          subscriptions.length > 0
            ? subscriptions[0].current_period_end * 1000
            : undefined,
        carryExistingUsages,
        scenario: AttachScenario.New,
        logger,
      }),
    );
  }
  await Promise.all(batchInsert);

  // Do this async...

  const insertInvoice = async (invoiceId: string) => {
    const invoice = await getStripeExpandedInvoice({
      stripeCli,
      stripeInvoiceId: invoiceId,
    });

    let invoiceItems = await getInvoiceItems({
      stripeInvoice: invoice,
      prices: attachParams.prices,
      logger,
    });

    await InvoiceService.createInvoiceFromStripe({
      db: req.db,
      stripeInvoice: invoice,
      internalCustomerId: customer.internal_id,
      internalEntityId: attachParams.internalEntityId,
      internalProductIds: products.map((p) => p.internal_id),
      productIds: products.map((p) => p.id),
      org,
      items: invoiceItems,
    });

    return invoice;
  };

  const batchInsertInvoice = [];
  for (const invoiceId of invoiceIds) {
    try {
      // Handle async
      batchInsertInvoice.push(insertInvoice(invoiceId));
    } catch (error) {
      logger.error("handleBillNowPrices: error retrieving invoice", error);
    }
  }
  const invoices = await Promise.all(batchInsertInvoice);

  if (fromRequest) {
    let apiVersion = attachParams.apiVersion || APIVersion.v1;
    if (apiVersion >= APIVersion.v1_1) {
      res.status(200).json(
        AttachResultSchema.parse({
          message: `Successfully created subscriptions and attached ${products
            .map((p) => p.name)
            .join(", ")} to ${customer.name}`,

          code: SuccessCode.NewProductAttached,
          product_ids: products.map((p) => p.id),
          customer_id: customer.id || customer.internal_id,

          invoice: invoiceOnly ? invoices?.[0] : undefined,
        }),
      );
    } else {
      res.status(200).json({
        success: true,
        message: `Successfully created subscriptions and attached ${products
          .map((p) => p.name)
          .join(", ")} to ${customer.name}`,
        invoice: invoiceOnly ? invoices?.[0] : undefined,
      });
    }
  }
};

export const handleOneOffPrices = async ({
  req,
  attachParams,
  res,
  fromRequest = true,
  shouldPreview = false,
}: {
  req: any;
  attachParams: AttachParams;
  res: any;
  fromRequest?: boolean;
  shouldPreview?: boolean;
}) => {
  const logger = req.logtail;
  logger.info("Scenario 4A: One-off prices");

  const {
    org,
    customer,
    products,
    prices,
    optionsList,
    entitlements,
    invoiceOnly,
  } = attachParams;

  // 1. Create invoice
  const stripeCli = createStripeCli({ org, env: customer.env });

  let invoiceItems = [];
  let autumnInvoiceItems: InvoiceItem[] = [];

  // 2. Create invoice items
  for (const price of prices) {
    // Calculate amount
    const options = getPriceOptions(price, optionsList);
    const entitlement = getPriceEntitlement(price, entitlements);
    const amount = getPriceAmount({
      price,
      options,
      relatedEnt: entitlement,
    });

    let allowanceStr = "";
    if (entitlement) {
      allowanceStr = ` - ${entitlement.feature.name}`;
    }

    let product = getProductForPrice(price, products);

    let amountData = {};
    let billingType = getBillingType(price.config!);

    if (billingType == BillingType.OneOff) {
      amountData = {
        price: price.config?.stripe_price_id,
      };
    } else {
      amountData = {
        amount: amount * 100,
        currency: org.default_currency,
      };
    }

    let previewData = {};
    if (shouldPreview) {
      previewData = {
        ...priceToAmountOrTiers(price),
        usage_model:
          billingType == BillingType.UsageInAdvance
            ? UsageModel.Prepaid
            : price.config?.type == PriceType.Usage
              ? UsageModel.PayPerUse
              : null,
        feature_name: entitlement?.feature.name,
      };
    }

    invoiceItems.push({
      description: `${product?.name}${allowanceStr}`,
      ...amountData,
      ...previewData,
    });

    autumnInvoiceItems.push({
      price_id: price.id!,
      description: `${product?.name}${allowanceStr}`,
      internal_feature_id: entitlement?.feature.internal_id || null,
      period_start: Date.now(),
      period_end: Date.now(),
      stripe_id: "",
    });
  }

  if (shouldPreview) {
    return autumnInvoiceItems;
  }

  logger.info("   1. Creating invoice");
  let stripeInvoice = await stripeCli.invoices.create({
    customer: customer.processor.id,
    auto_advance: false,
    currency: org.default_currency,
  });

  logger.info("   2. Creating invoice items");

  for (let i = 0; i < invoiceItems.length; i++) {
    let invoiceItem = invoiceItems[i];
    let stripeInvoiceItem = await stripeCli.invoiceItems.create({
      ...invoiceItem,
      customer: customer.processor.id,
      invoice: stripeInvoice.id,
    });

    autumnInvoiceItems[i] = {
      ...autumnInvoiceItems[i],
      stripe_id: stripeInvoiceItem.id,
    };
  }

  if (!attachParams.invoiceOnly) {
    stripeInvoice = await stripeCli.invoices.finalizeInvoice(
      stripeInvoice.id,
      getInvoiceExpansion(),
    );

    logger.info("   3. Paying invoice");
    const { paid, error } = await payForInvoice({
      fullOrg: org,
      env: customer.env,
      customer: customer,
      invoice: stripeInvoice,
      logger,
    });

    if (!paid) {
      await stripeCli.invoices.voidInvoice(stripeInvoice.id);
      if (fromRequest && org.config.checkout_on_failed_payment) {
        await handleCreateCheckout({
          req,
          res,
          attachParams,
        });
        return;
      } else {
        throw error;
      }
    }
  }

  // Insert full customer product
  logger.info("   4. Creating full customer product");
  const batchInsert = [];
  for (const product of products) {
    batchInsert.push(
      createFullCusProduct({
        db: req.db,
        attachParams: attachToInsertParams(attachParams, product),
        lastInvoiceId: stripeInvoice.id,
        logger,
      }),
    );
  }
  await Promise.all(batchInsert);

  logger.info("   5. Creating invoice from stripe");
  await InvoiceService.createInvoiceFromStripe({
    db: req.db,
    stripeInvoice: stripeInvoice,
    internalCustomerId: customer.internal_id,
    internalEntityId: attachParams.internalEntityId,
    productIds: products.map((p) => p.id),
    internalProductIds: products.map((p) => p.internal_id),
    org: org,
    items: autumnInvoiceItems,
  });

  logger.info("   ✅ Successfully attached product");

  if (fromRequest) {
    res.status(200).json(
      AttachResultSchema.parse({
        success: true,
        message: `Successfully purchased ${products
          .map((p) => p.name)
          .join(", ")} and attached to ${customer.name}`,
        invoice: invoiceOnly ? stripeInvoice : undefined,

        code: SuccessCode.OneOffProductAttached,
        product_ids: products.map((p) => p.id),
        customer_id: customer.id || customer.internal_id,
        scenario: AttachScenario.New,
      }),
    );
  }
};

export const handleAddProduct = async ({
  req,
  res,
  attachParams,
  config,
  // fromRequest = true,
  // carryExistingUsages = false,
  // keepResetIntervals = false,
  disableMerge = false,
}: {
  req: ExtendedRequest;
  res: any;
  attachParams: AttachParams;
  config: AttachConfig;
  // fromRequest?: boolean;
  // carryExistingUsages?: boolean;
  // keepResetIntervals?: boolean;
  disableMerge?: boolean;
}) => {
  const logger = req.logtail;
  const { customer, products, prices } = attachParams;

  // 1. Handle one-off payment products
  if (pricesOnlyOneOff(prices)) {
    await handleOneOffPrices({
      req,
      res,
      attachParams,
      // fromRequest,
    });

    return;
  }

  // 2. Get one-off + fixed cycle prices
  if (prices.length > 0) {
    await handleBillNowPrices({
      attachParams,
      req,
      res,
      fromRequest,
      carryExistingUsages,
      disableMerge,
    });

    return;
  }

  logger.info("Inserting free product in handleAddProduct");

  const batchInsert = [];

  for (const product of products) {
    batchInsert.push(
      createFullCusProduct({
        db: req.db,
        attachParams: attachToInsertParams(attachParams, product),
        subscriptionId: undefined,
        billLaterOnly: true,
        carryExistingUsages,
        keepResetIntervals,
        logger,
      }),
    );
  }
  await Promise.all(batchInsert);

  logger.info("Successfully created full cus product");

  if (fromRequest) {
    let apiVersion = attachParams.org.api_version || APIVersion.v1;
    if (apiVersion >= APIVersion.v1_1) {
      res.status(200).json(
        AttachResultSchema.parse({
          success: true,
          code: SuccessCode.FreeProductAttached,
          message: `Successfully attached free product(s) -- ${products
            .map((p) => p.name)
            .join(", ")}`,
          product_ids: products.map((p) => p.id),
          customer_id: customer.id,
        }),
      );
    } else {
      res.status(200).json({
        success: true,
      });
    }
  }
};
