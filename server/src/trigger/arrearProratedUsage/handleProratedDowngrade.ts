import {
  FullCusEntWithFullCusProduct,
  FullCusEntWithProduct,
  FullCustomerPrice,
  OnDecrease,
} from "@autumn/shared";
import Stripe from "stripe";

import {
  Feature,
  Organization,
  Product,
  UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { getFeatureInvoiceDescription } from "@autumn/shared";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { constructStripeInvoiceItem } from "@/internal/invoices/invoiceItemUtils/invoiceItemUtils.js";
import { createAndFinalizeInvoice } from "@/internal/invoices/invoiceUtils/createAndFinalizeInvoice.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import { getStripeNow } from "@/utils/scriptUtils/testClockUtils.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/getAmountForPrice.js";
import { handleCreateReplaceables } from "./handleCreateReplaceables.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { getUsageFromBalance } from "../adjustAllowance.js";

export const createDowngradeProrationInvoice = async ({
  org,
  cusPrice,
  stripeCli,
  sub,
  newPrice,
  prevPrice,
  newRoundedUsage,
  feature,
  product,
  onDecrease,
  logger,
}: {
  org: Organization;
  cusPrice: FullCustomerPrice;
  stripeCli: Stripe;
  sub: Stripe.Subscription;
  newPrice: number;
  prevPrice: number;
  newRoundedUsage: number;
  feature: Feature;
  product: Product;
  onDecrease: OnDecrease;
  logger: any;
}) => {
  const config = cusPrice.price.config as UsagePriceConfig;

  let now = await getStripeNow({ stripeCli, stripeSub: sub });
  let invoiceAmount = new Decimal(newPrice).minus(prevPrice).toNumber();

  logger.info(`Prev price: ${prevPrice}, New price: ${newPrice}`);
  logger.info(`Invoice amount: ${invoiceAmount}`);

  let invoiceDescription = getFeatureInvoiceDescription({
    feature,
    usage: newRoundedUsage,
    billingUnits: config.billing_units,
    prodName: product.name,
  });

  invoiceAmount = calculateProrationAmount({
    periodStart: sub.current_period_start * 1000,
    periodEnd: sub.current_period_end * 1000,
    now,
    amount: invoiceAmount,
    allowNegative: true,
  });

  let start = formatUnixToDate(now);
  let end = formatUnixToDate(sub.current_period_end * 1000);
  invoiceDescription = `${invoiceDescription} (from ${start} to ${end})`;

  if (invoiceAmount == 0) return;

  logger.info(
    `🚀 Creating invoice item: ${invoiceDescription} - ${invoiceAmount.toFixed(2)}`,
  );

  const { invoice } = await createAndFinalizeInvoice({
    stripeCli,
    stripeCusId: sub.customer as string,
    stripeSubId: sub.id,
    invoiceItems: [
      constructStripeInvoiceItem({
        product,
        amount: invoiceAmount,
        org,
        price: cusPrice.price,
        description: invoiceDescription,
        stripeSubId: sub.id,
        stripeCustomerId: sub.customer as string,
        periodStart: sub.current_period_start,
        periodEnd: Math.floor(now / 1000),
      }),
    ],
  });

  return invoice;
};

export const handleProratedDowngrade = async ({
  db,
  org,
  stripeCli,
  cusEnt,
  cusPrice,
  sub,
  subItem,
  newBalance,
  prevBalance,
  logger,
}: {
  db: DrizzleCli;
  org: Organization;
  stripeCli: Stripe;
  cusEnt: FullCusEntWithFullCusProduct;
  cusPrice: FullCustomerPrice;
  sub: Stripe.Subscription;
  subItem: Stripe.SubscriptionItem;
  newBalance: number;
  prevBalance: number;
  logger: any;
}) => {
  logger.info(`Handling quantity decrease`);

  const {
    roundedUsage: newRoundedUsage,
    roundedOverage: newRoundedOverage,
    overage: newOverage,
  } = getUsageFromBalance({
    ent: cusEnt.entitlement,
    price: cusPrice.price,
    balance: newBalance,
  });

  const { roundedOverage: prevRoundedOverage, overage: prevOverage } =
    getUsageFromBalance({
      ent: cusEnt.entitlement,
      price: cusPrice.price,
      balance: prevBalance,
    });

  let onDecrease =
    cusPrice.price.proration_config?.on_decrease || OnDecrease.Prorate;

  const feature = cusEnt.entitlement.feature;
  const product = cusEnt.customer_product.product;

  let invoice = null;
  let newReplaceables = null;

  if (onDecrease === OnDecrease.Prorate) {
    let prevPrice = priceToInvoiceAmount({
      price: cusPrice.price,
      overage: prevRoundedOverage,
    });

    let newPrice = priceToInvoiceAmount({
      price: cusPrice.price,
      overage: newRoundedOverage,
    });

    invoice = await createDowngradeProrationInvoice({
      org,
      cusPrice,
      stripeCli,
      sub,
      newPrice,
      prevPrice,
      newRoundedUsage,
      feature,
      product,
      onDecrease,
      logger,
    });
  } else {
    newReplaceables = await handleCreateReplaceables({
      db,
      prevOverage,
      newOverage,
      cusEnt,
      logger,
    });

    logger.info("New replaceables", {
      newReplaceables,
    });
  }

  await stripeCli.subscriptionItems.update(subItem.id, {
    quantity: newRoundedUsage,
    proration_behavior: "none",
  });

  return { invoice, newReplaceables, deletedReplaceables: null };
};
