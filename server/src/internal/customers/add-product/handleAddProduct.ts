import {
  getBillLaterPrices,
  getBillNowPrices,
  getPriceEntitlement,
  getPriceOptions,
  getProductForPrice,
  pricesOnlyOneOff,
} from "@/internal/prices/priceUtils.js";

import RecaseError from "@/utils/errorUtils.js";
import chalk from "chalk";

import { SupabaseClient } from "@supabase/supabase-js";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { AttachParams } from "../products/AttachParams.js";
import { getPriceAmount } from "../../prices/priceUtils.js";
import {
  AllowanceType,
  BillingInterval,
  ErrCode,
  InvoiceStatus,
} from "@autumn/shared";
import { InvoiceService } from "../invoices/InvoiceService.js";
import {
  getInvoiceExpansion,
  getStripeExpandedInvoice,
  payForInvoice,
} from "@/external/stripe/stripeInvoiceUtils.js";

import { handleCreateCheckout } from "./handleCreateCheckout.js";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import Stripe from "stripe";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { createStripeSub } from "@/external/stripe/stripeSubUtils/createStripeSub.js";
import {
  getAlignedIntervalUnix,
  getNextStartOfMonthUnix,
} from "@/internal/prices/billingIntervalUtils.js";
import { format } from "date-fns";

const handleBillNowPrices = async ({
  sb,
  attachParams,
  res,
  req,
  fromRequest = true,
}: {
  sb: SupabaseClient;
  attachParams: AttachParams;
  res: any;
  req: any;
  fromRequest?: boolean;
}) => {
  const logger = req.logtail;
  const { org, customer, products, freeTrial, invoiceOnly } = attachParams;

  const stripeCli = createStripeCli({ org, env: customer.env });

  let itemSets = await getStripeSubItems({
    attachParams,
  });

  let subscriptions: Stripe.Subscription[] = [];
  let invoiceIds: string[] = [];

  for (const itemSet of itemSets) {
    if (itemSet.interval === BillingInterval.OneOff) {
      continue;
    }

    const { items } = itemSet;

    let subscription;
    try {
      // Should create 2 subscriptions

      let billingCycleAnchorUnix;
      if (org.config.anchor_start_of_month) {
        billingCycleAnchorUnix = getNextStartOfMonthUnix(itemSet.interval);
      }

      if (attachParams.billingAnchor) {
        // Add interval to now
        billingCycleAnchorUnix = getAlignedIntervalUnix(
          attachParams.billingAnchor,
          itemSet.interval
        );
      }

      subscription = await createStripeSub({
        stripeCli,
        customer,
        org,
        freeTrial,
        invoiceOnly,
        itemSet,
        billingCycleAnchorUnix,
      });

      subscriptions.push(subscription);
      invoiceIds.push(subscription.latest_invoice as string);
    } catch (error: any) {
      if (
        error instanceof RecaseError &&
        !invoiceOnly &&
        (error.code === ErrCode.StripeCardDeclined ||
          error.code === ErrCode.CreateStripeSubscriptionFailed)
      ) {
        await handleCreateCheckout({
          sb,
          res,
          attachParams,
          req,
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
        sb,
        attachParams: attachToInsertParams(attachParams, product),
        subscriptionIds: subscriptions.map((s) => s.id),
        subscriptionId:
          subscriptions.length > 0 ? subscriptions[0].id : undefined,
        anchorToUnix:
          subscriptions.length > 0
            ? subscriptions[0].current_period_end * 1000
            : undefined,
      })
    );
  }
  await Promise.all(batchInsert);

  // Do this async...
  const insertInvoice = async (invoiceId: string) => {
    const invoice = await getStripeExpandedInvoice({
      stripeCli,
      stripeInvoiceId: invoiceId,
    });

    await InvoiceService.createInvoiceFromStripe({
      sb,
      stripeInvoice: invoice,
      internalCustomerId: customer.internal_id,
      productIds: products.map((p) => p.id),
      internalProductIds: products.map((p) => p.internal_id),
      org,
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
    res.status(200).send({
      success: true,
      message: `Successfully created subscriptions and attached ${products
        .map((p) => p.name)
        .join(", ")} to ${customer.name}`,
      // invoice_url: invoiceOnly &&
      invoice: invoiceOnly ? invoices?.[0] : undefined,
      // invoiceOnly && invoices?.[0]?.hosted_invoice_url
      //   ? invoices[0].hosted_invoice_url
      //   : undefined,
    });
  }
};

const handleOneOffPrices = async ({
  req,
  sb,
  attachParams,
  res,
  fromRequest = true,
}: {
  req: any;
  sb: SupabaseClient;
  attachParams: AttachParams;
  res: any;
  fromRequest?: boolean;
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

  logger.info("   1. Creating invoice");
  let stripeInvoice = await stripeCli.invoices.create({
    customer: customer.processor.id,
    auto_advance: false,
  });

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

    await stripeCli.invoiceItems.create({
      customer: customer.processor.id,
      amount: amount * 100,
      invoice: stripeInvoice.id,
      description: `${product?.name}${allowanceStr}`,
    });
  }

  if (!attachParams.invoiceOnly) {
    stripeInvoice = await stripeCli.invoices.finalizeInvoice(
      stripeInvoice.id,
      getInvoiceExpansion()
    );

    logger.info("   2. Paying invoice");
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
          sb,
          req,
          res,
          attachParams,
        });
      } else {
        throw error;
      }
    }
  }

  // Insert full customer product
  logger.info("   3. Creating full customer product");
  const batchInsert = [];
  for (const product of products) {
    batchInsert.push(
      createFullCusProduct({
        sb,
        attachParams: attachToInsertParams(attachParams, product),
        lastInvoiceId: stripeInvoice.id,
      })
    );
  }
  await Promise.all(batchInsert);

  logger.info("   4. Creating invoice from stripe");
  await InvoiceService.createInvoiceFromStripe({
    sb,
    stripeInvoice: stripeInvoice,
    internalCustomerId: customer.internal_id,
    productIds: products.map((p) => p.id),
    internalProductIds: products.map((p) => p.internal_id),
    org: org,
  });

  logger.info("   ✅ Successfully attached product");

  if (fromRequest) {
    res.status(200).json({
      success: true,
      message: `Successfully purchased ${products
        .map((p) => p.name)
        .join(", ")} and attached to ${customer.name}`,
      invoice: invoiceOnly ? stripeInvoice : undefined,
      // invoice_url:
      //   invoiceOnly && finalizedInvoice?.hosted_invoice_url
      //     ? finalizedInvoice.hosted_invoice_url
      //     : undefined,
    });
  }
};

export const handleAddProduct = async ({
  req,
  res,
  attachParams,
  fromRequest = true,
}: {
  req: {
    sb: SupabaseClient;
    logtail: any;
  };
  res: any;
  attachParams: AttachParams;
  fromRequest?: boolean;
}) => {
  const logger = req.logtail;
  const { customer, products, prices } = attachParams;

  for (const product of products) {
    if (product.is_add_on) {
      logger.info(
        `Adding add-on ${chalk.yellowBright(
          product.name
        )} to customer ${chalk.yellowBright(customer.id)}`
      );
    } else {
      logger.info(
        `Adding product ${chalk.yellowBright(
          product.name
        )} to customer ${chalk.yellowBright(customer.id)}`
      );
    }
  }

  // 1. Handle one-off payment products
  if (pricesOnlyOneOff(prices)) {
    await handleOneOffPrices({
      sb: req.sb,
      req,
      res,
      attachParams,
      fromRequest,
    });

    return;
  }

  // 2. Get one-off + fixed cycle prices
  const billNowPrices = getBillNowPrices(prices);

  if (billNowPrices.length > 0) {
    await handleBillNowPrices({
      sb: req.sb,
      attachParams,
      req,
      res,
      fromRequest,
    });

    return;
  }

  logger.info("Creating bill later prices");

  const billLaterPrices = getBillLaterPrices(prices);

  const batchInsert = [];
  for (const product of products) {
    batchInsert.push(
      createFullCusProduct({
        sb: req.sb,
        attachParams: attachToInsertParams(attachParams, product),
        subscriptionId: undefined,
        billLaterOnly: true,
      })
    );
  }
  await Promise.all(batchInsert);

  logger.info("Successfully created full cus product");

  res.status(200).json({ success: true });
};
