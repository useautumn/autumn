import {
  Feature,
  FullEntitlement,
  getFeatureInvoiceDescription,
  OnIncrease,
  Organization,
  Price,
  Product,
  UsagePriceConfig,
} from "@autumn/shared";
import Stripe from "stripe";
import { Decimal } from "decimal.js";
import { shouldProrate } from "../prorationConfigUtils.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import { constructStripeInvoiceItem } from "@/internal/invoices/invoiceItemUtils/invoiceItemUtils.js";
import { priceToInvoiceAmount } from "../priceToInvoiceAmount.js";
import { getPrevAndNewPriceForUpgrade } from "./getPrevAndNewUsages.js";

export const getNewContUsageAmount = ({
  price,
  ent,
  newBalance,
  prevBalance,
  numReplaceables = 0,
  stripeSub,
  now,
}: {
  price: Price;
  ent: FullEntitlement;
  newBalance: number;
  prevBalance: number;
  numReplaceables?: number;
  stripeSub?: Stripe.Subscription;
  now: number;
}) => {
  let { overageWithReplaceables: prevRoundedOverage, newRoundedOverage } =
    getPrevAndNewPriceForUpgrade({
      ent,
      numReplaceables,
      price,
      newBalance,
      prevBalance,
    });

  // Get price for usage...
  let prevPrice = priceToInvoiceAmount({
    price,
    overage: prevRoundedOverage,
  });

  let newPrice = priceToInvoiceAmount({
    price,
    overage: newRoundedOverage,
  });

  let invoiceAmount = new Decimal(newPrice).minus(prevPrice).toNumber();

  let onIncrease = price.proration_config?.on_increase;
  if (shouldProrate(onIncrease) && stripeSub) {
    // console.log(
    //   "Period start: ",
    //   formatUnixToDate(stripeSub.current_period_start * 1000),
    // );
    // console.log(
    //   "Period end: ",
    //   formatUnixToDate(stripeSub.current_period_end * 1000),
    // );

    invoiceAmount = calculateProrationAmount({
      periodStart: stripeSub.current_period_start * 1000,
      periodEnd: stripeSub.current_period_end * 1000,
      now,
      amount: invoiceAmount,
      allowNegative: true,
    });
  }

  return invoiceAmount;
};

export const getContUsageUpgradeItem = ({
  prevPrice,
  newPrice,
  now,
  feature,
  newRoundedUsage,
  price,
  org,
  onIncrease,
  product,
  stripeSub,
}: {
  prevPrice: number;
  newPrice: number;
  now: number;
  feature: Feature;
  newRoundedUsage: number;
  price: Price;
  org: Organization;
  onIncrease: OnIncrease;
  product: Product;
  stripeSub: Stripe.Subscription;
}) => {
  const billingUnits = (price.config as UsagePriceConfig).billing_units;
  let invoiceAmount = new Decimal(newPrice).minus(prevPrice).toNumber();

  let invoiceDescription = getFeatureInvoiceDescription({
    feature,
    usage: newRoundedUsage,
    billingUnits,
    prodName: product.name,
  });

  if (shouldProrate(onIncrease)) {
    invoiceAmount = calculateProrationAmount({
      periodStart: stripeSub.current_period_start * 1000,
      periodEnd: stripeSub.current_period_end * 1000,
      now,
      amount: invoiceAmount,
    });

    let start = formatUnixToDate(now);
    let end = formatUnixToDate(stripeSub.current_period_end * 1000);
    invoiceDescription = `${invoiceDescription} (from ${start} to ${end})`;
  }

  let invoiceItem = constructStripeInvoiceItem({
    product,
    amount: invoiceAmount,
    org,
    price: price,
    description: invoiceDescription,
    stripeSubId: stripeSub.id,
    stripeCustomerId: stripeSub.customer as string,
    periodStart: stripeSub.current_period_start,
    periodEnd: Math.floor(now / 1000),
  });

  return invoiceItem;
};
