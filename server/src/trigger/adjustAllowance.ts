import {
  Entitlement,
  FullCusEntWithFullCusProduct,
  FullCusEntWithProduct,
  Price,
} from "@autumn/shared";
import {
  AppEnv,
  BillingType,
  Customer,
  Feature,
  FullCustomerPrice,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";

import { getRelatedCusPrice } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { getUsageBasedSub } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { Decimal } from "decimal.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { handleProratedUpgrade } from "./arrearProratedUsage/handleProratedUpgrade.js";
import Stripe from "stripe";
import { handleProratedDowngrade } from "./arrearProratedUsage/handleProratedDowngrade.js";

export const getUsageFromBalance = ({
  ent,
  price,
  balance,
}: {
  ent: Entitlement;
  price: Price;
  balance: number;
}) => {
  let config = price.config as UsagePriceConfig;
  let billingUnits = config.billing_units || 1;

  // Should get overage...
  let overage = -Math.min(0, balance);
  let roundedOverage = new Decimal(overage)
    .div(billingUnits)
    .ceil()
    .mul(billingUnits)
    .toNumber();

  let usage = new Decimal(ent.allowance!).sub(balance).toNumber();

  let roundedUsage = usage;
  if (overage > 0) {
    roundedUsage = new Decimal(usage)
      .div(billingUnits)
      .ceil()
      .mul(billingUnits)
      .toNumber();
  }

  return { usage, roundedUsage, overage, roundedOverage };
};

export const adjustAllowance = async ({
  db,
  env,
  org,
  affectedFeature,
  cusEnt,
  cusPrices,
  customer,
  originalBalance,
  newBalance,
  logger,
  errorIfIncomplete = false,
  // deduction,
  // product,
  // fromEntities = false,
}: {
  db: DrizzleCli;
  env: AppEnv;
  affectedFeature: Feature;
  org: Organization;
  cusEnt: FullCusEntWithFullCusProduct;
  cusPrices: FullCustomerPrice[];
  customer: Customer;
  originalBalance: number;
  newBalance: number;
  logger: any;
  errorIfIncomplete?: boolean;
}) => {
  let cusPrice = getRelatedCusPrice(cusEnt, cusPrices);
  let billingType = cusPrice ? getBillingType(cusPrice.price.config!) : null;
  let cusProduct = cusEnt.customer_product;

  if (
    !cusProduct ||
    !cusPrice ||
    billingType !== BillingType.InArrearProrated ||
    originalBalance == newBalance
  ) {
    return { newReplaceables: [], invoice: null, deletedReplaceables: null };
  }

  logger.info(`--------------------------------`);
  logger.info(`Updating arrear prorated usage: ${affectedFeature.name}`);
  logger.info(`Customer: ${customer.name}, Org: ${org.slug}`);

  let stripeCli = createStripeCli({ org, env });
  let sub = await getUsageBasedSub({
    db,
    stripeCli,
    subIds: cusProduct.subscription_ids!,
    feature: affectedFeature,
  });

  if (!sub) {
    logger.error("adjustAllowance: no usage-based sub found");
    return { newReplaceables: null, invoice: null, deletedReplaceables: null };
  }

  let subItem = findStripeItemForPrice({
    price: cusPrice.price,
    stripeItems: sub.items.data,
  });

  if (!subItem) {
    logger.error("adjustAllowance: no sub item found");
    return { newReplaceables: null, invoice: null, deletedReplaceables: null };
  }

  let isUpgrade = newBalance < originalBalance;

  if (isUpgrade) {
    return await handleProratedUpgrade({
      db,
      stripeCli,
      cusEnt,
      cusPrice,
      sub,
      subItem: subItem as Stripe.SubscriptionItem,
      newBalance,
      prevBalance: originalBalance,
      org,
      logger,
    });
  } else {
    return await handleProratedDowngrade({
      db,
      org,
      stripeCli,
      cusEnt,
      cusPrice,
      sub,
      subItem: subItem as Stripe.SubscriptionItem,
      newBalance,
      prevBalance: originalBalance,
      logger,
    });
  }
};
