import {
  Feature,
  FullCustomerPrice,
  OnIncrease,
  Organization,
  Price,
  Product,
  UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { getFeatureInvoiceDescription } from "@autumn/shared";
import Stripe from "stripe";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import { constructStripeInvoiceItem } from "@/internal/invoices/invoiceItemUtils/invoiceItemUtils.js";
import { createAndFinalizeInvoice } from "@/internal/invoices/invoiceUtils/createAndFinalizeInvoice.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import {
  shouldProrate,
  shouldBillNow,
} from "@/internal/products/prices/priceUtils/prorationConfigUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import { getStripeNow } from "@/utils/scriptUtils/testClockUtils.js";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";

export const getUpgradeProrationInvoiceItem = ({
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
  subItem,
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
  subItem: Stripe.SubscriptionItem;
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
      periodStart: subItem.current_period_start * 1000,
      periodEnd: subItem.current_period_end * 1000,
      now,
      amount: invoiceAmount,
    });

    let start = formatUnixToDate(now);
    let end = formatUnixToDate(subItem.current_period_end * 1000);
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
    periodStart: Math.floor(now / 1000),
    periodEnd: Math.floor(subItem.current_period_end * 1000),
  });

  return invoiceItem;
};

export const createUpgradeProrationInvoice = async ({
  org,
  cusPrice,
  stripeCli,
  sub,
  subItem,
  newPrice,
  prevPrice,
  newRoundedUsage,
  feature,
  product,
  config,
  onIncrease,
  logger,
}: {
  org: Organization;
  cusPrice: FullCustomerPrice;
  stripeCli: Stripe;
  sub: Stripe.Subscription;
  subItem: Stripe.SubscriptionItem;
  newPrice: number;
  prevPrice: number;
  newRoundedUsage: number;
  feature: Feature;
  product: Product;
  config: UsagePriceConfig;
  onIncrease: OnIncrease;
  logger: any;
}) => {
  let now = await getStripeNow({ stripeCli, stripeSub: sub });

  const paymentMethod = await getCusPaymentMethod({
    stripeCli,
    stripeId: sub.customer as string,
  });

  let invoiceItem = getUpgradeProrationInvoiceItem({
    prevPrice,
    newPrice,
    now,
    feature,
    newRoundedUsage,
    price: cusPrice.price,
    org,
    onIncrease,
    product,
    stripeSub: sub,
    subItem,
  });

  let invoiceAmount =
    invoiceItem?.amount || invoiceItem?.price_data?.unit_amount || 0;

  let invoiceDescription = invoiceItem?.description || "";

  if (invoiceAmount == 0) return;

  logger.info(
    `🚀 Creating invoice item: ${invoiceDescription} - ${invoiceAmount.toFixed(2)}`
  );

  await stripeCli.invoiceItems.create(invoiceItem);

  if (shouldBillNow(onIncrease)) {
    const { invoice: finalInvoice } = await createAndFinalizeInvoice({
      stripeCli,
      paymentMethod,
      stripeCusId: sub.customer as string,
      stripeSubId: sub.id,
      logger,
    });

    logger.info(`Paid for invoice ${finalInvoice?.id}`);
    return finalInvoice;
  }

  return null;
};
