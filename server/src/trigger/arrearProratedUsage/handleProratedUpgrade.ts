import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import { shouldCreateInvoiceItem } from "@/internal/products/prices/priceUtils/prorationConfigUtils.js";

import {
  Entitlement,
  FullCusEntWithFullCusProduct,
  FullCusEntWithProduct,
  FullCustomerPrice,
  OnIncrease,
  Organization,
  Price,
  UsagePriceConfig,
} from "@autumn/shared";

import Stripe from "stripe";
import { createUpgradeProrationInvoice } from "./createUpgradeProrationInvoice.js";
import { getUsageFromBalance } from "../adjustAllowance.js";
import { RepService } from "@/internal/customers/cusProducts/cusEnts/RepService.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { roundUsage } from "@/internal/products/prices/priceUtils/usagePriceUtils.js";

interface UsageValues {
  prevRoundedUsage: number;
  newRoundedUsage: number;
  prevRoundedOverage: number;
  newRoundedOverage: number;
}

export const getPrevAndNewPriceForUpgrade = ({
  ent,
  // numReplaceables,
  price,
  newBalance,
  prevBalance,
  logger,
}: {
  ent: Entitlement;
  // numReplaceables: number;
  price: Price;
  newBalance: number;
  prevBalance: number;
  logger: any;
}) => {
  const { usage: prevUsage, overage: prevOverage } = getUsageFromBalance({
    ent,
    price,
    balance: prevBalance,
  });

  const { usage: newUsage, overage: newOverage } = getUsageFromBalance({
    ent,
    price,
    balance: newBalance,
  });

  let prevPrice = priceToInvoiceAmount({
    price,
    overage: roundUsage({
      // usage: prevUsage,
      usage: prevOverage,
      price,
    }),
  });

  let newPrice = priceToInvoiceAmount({
    price,
    overage: roundUsage({
      // usage: newUsage,
      usage: newOverage,
      price,
    }),
  });

  return {
    // prevOverage,
    // newOverage,
    newUsage,
    // prevUsage,
    prevPrice,
    newPrice,
  };
};

export const handleProratedUpgrade = async ({
  db,
  stripeCli,
  cusEnt,
  org,
  cusPrice,
  sub,
  subItem,
  newBalance,
  prevBalance,
  logger,
}: {
  db: DrizzleCli;
  stripeCli: Stripe;
  org: Organization;
  cusEnt: FullCusEntWithFullCusProduct;
  cusPrice: FullCustomerPrice;
  sub: Stripe.Subscription;
  subItem: Stripe.SubscriptionItem;
  newBalance: number;
  prevBalance: number;
  logger: any;
}) => {
  logger.info(`Handling quantity increase`);

  // 1. Get num reps to use
  let usageDiff = prevBalance - newBalance;
  let reps = cusEnt.replaceables.slice(0, usageDiff);
  newBalance = newBalance + reps.length; // Increase new balance by number of reps

  let { prevPrice, newPrice, newUsage } = getPrevAndNewPriceForUpgrade({
    ent: cusEnt.entitlement,
    price: cusPrice.price,
    newBalance,
    prevBalance,
    logger,
  });

  const config = cusPrice.price.config as UsagePriceConfig;
  const product = cusEnt.customer_product.product;
  const feature = cusEnt.entitlement.feature;

  let onIncrease =
    cusPrice.price.proration_config?.on_increase ||
    OnIncrease.ProrateImmediately;

  const newRoundedUsage = roundUsage({
    usage: newUsage,
    price: cusPrice.price,
  });

  let invoice = null;
  if (shouldCreateInvoiceItem(onIncrease)) {
    invoice = await createUpgradeProrationInvoice({
      org,
      cusPrice,
      stripeCli,
      sub,
      newPrice,
      prevPrice,
      newRoundedUsage,
      feature,
      product,
      config,
      onIncrease,
      logger,
    });
  }

  let deleted = await RepService.deleteInIds({
    db,
    ids: reps.map((r) => r.id),
  });

  await stripeCli.subscriptionItems.update(subItem.id, {
    quantity: roundUsage({
      usage: newUsage,
      price: cusPrice.price,
    }),
    proration_behavior: "none",
  });

  logger.info(`Updated sub item ${subItem.id} to quantity: ${newRoundedUsage}`);
  return { deletedReplaceables: deleted, invoice, newReplaceables: [] };
};
