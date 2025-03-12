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
import { createStripeSubscription } from "@/external/stripe/stripeSubUtils.js";
import { handleCreateCheckout } from "./handleCreateCheckout.js";
import { getStripeSubItems } from "@/external/stripe/stripePriceUtils.js";
import Stripe from "stripe";
import { attachToInsertParams } from "@/internal/products/productUtils.js";

const handleBillNowPrices = async ({
  sb,
  attachParams,
  res,
  req,
}: {
  sb: SupabaseClient;
  attachParams: AttachParams;
  res: any;
  req: any;
}) => {
  const logger = req.logtail;
  const { org, customer, products, freeTrial } = attachParams;

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

    try {
      // Should create 2 subscriptions
      let subscription = await createStripeSubscription({
        stripeCli,
        customer,
        org,
        items,
        freeTrial,
        metadata: itemSet.subMeta,
        prices: itemSet.prices,
      });

      subscriptions.push(subscription);
      invoiceIds.push(subscription.latest_invoice as string);
    } catch (error: any) {
      if (
        error instanceof RecaseError &&
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
      })
    );
  }
  await Promise.all(batchInsert);

  for (const invoiceId of invoiceIds) {
    try {
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
    } catch (error) {
      logger.error("handleBillNowPrices: error retrieving invoice", error);
    }
  }

  res.status(200).send({
    success: true,
    message: `Successfully created subscriptions and attached ${products
      .map((p) => p.name)
      .join(", ")} to ${customer.name}`,
  });
};

const handleOneOffPrices = async ({
  req,
  sb,
  attachParams,
  res,
}: {
  req: any;
  sb: SupabaseClient;
  attachParams: AttachParams;
  res: any;
}) => {
  const { org, customer, products, prices, optionsList, entitlements } =
    attachParams;

  // 1. Create invoice
  const stripeCli = createStripeCli({ org, env: customer.env });

  console.log("   1. Creating invoice");
  const stripeInvoice = await stripeCli.invoices.create({
    customer: customer.processor.id,
    auto_advance: true,
  });

  // 2. Create invoice items
  for (const price of prices) {
    // Calculate amount
    const options = getPriceOptions(price, optionsList);
    const entitlement = getPriceEntitlement(price, entitlements);
    const { amountPerUnit, quantity } = getPriceAmount(price, options!);

    let allowanceStr = "";
    if (entitlement) {
      allowanceStr =
        entitlement.allowance_type == AllowanceType.Unlimited
          ? "Unlimited"
          : entitlement.allowance_type == AllowanceType.None
          ? "None"
          : `${entitlement.allowance}`;
      allowanceStr = `x ${allowanceStr} (${entitlement.feature.name})`;
    }

    let product = getProductForPrice(price, products);

    await stripeCli.invoiceItems.create({
      customer: customer.processor.id,
      amount: amountPerUnit * quantity * 100,
      invoice: stripeInvoice.id,
      description: `Invoice for ${product?.name} -- ${quantity}${allowanceStr}`,
    });
  }

  const finalizedInvoice = await stripeCli.invoices.finalizeInvoice(
    stripeInvoice.id,
    getInvoiceExpansion()
  );

  console.log("   2. Paying invoice");
  const { paid, error } = await payForInvoice({
    fullOrg: org,
    env: customer.env,
    customer: customer,
    invoice: stripeInvoice,
  });

  if (!paid) {
    if (error!.code === ErrCode.StripeCardDeclined) {
      await stripeCli.invoices.voidInvoice(stripeInvoice.id);
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

  // Insert full customer product
  console.log("   3. Creating full customer product");
  const batchInsert = [];
  for (const product of products) {
    batchInsert.push(
      createFullCusProduct({
        sb,
        attachParams: attachToInsertParams(attachParams, product),
        lastInvoiceId: finalizedInvoice.id,
      })
    );
  }
  await Promise.all(batchInsert);

  console.log("   4. Creating invoice from stripe");
  await InvoiceService.createInvoiceFromStripe({
    sb,
    stripeInvoice: finalizedInvoice,
    internalCustomerId: customer.internal_id,
    productIds: products.map((p) => p.id),
    internalProductIds: products.map((p) => p.internal_id),
    status: InvoiceStatus.Paid,
    org: org,
  });

  console.log("   ✅ Successfully attached product");
  res.status(200).json({
    success: true,
    message: `Successfully purchased ${products
      .map((p) => p.name)
      .join(", ")} and attached to ${customer.name}`,
  });
};

export const handleAddProduct = async ({
  req,
  res,
  attachParams,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
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
    console.log("Handling one-off payment products");
    await handleOneOffPrices({
      sb: req.sb,
      req,
      attachParams,
      res,
    });

    return;
  }

  // 2. Get one-off + fixed cycle prices
  const billNowPrices = getBillNowPrices(prices);

  if (billNowPrices.length > 0) {
    await handleBillNowPrices({
      sb: req.sb,
      req,
      attachParams,
      res,
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
