import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/getAmountForPrice.js";
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

interface UsageValues {
  prevRoundedUsage: number;
  newRoundedUsage: number;
  prevRoundedOverage: number;
  newRoundedOverage: number;
}

export const getPrevAndNewPriceForUpgrade = ({
  ent,
  numReplaceables,
  price,
  newBalance,
  prevBalance,
  logger,
}: {
  ent: Entitlement;
  numReplaceables: number;
  price: Price;
  newBalance: number;
  prevBalance: number;
  logger: any;
}) => {
  const {
    usage: newUsage,
    roundedUsage: newRoundedUsage,
    roundedOverage: newRoundedOverage,
  } = getUsageFromBalance({
    ent,
    price,
    balance: newBalance,
  });

  const {
    usage: prevUsage,
    roundedUsage: prevRoundedUsage,
    overage: prevOverage,
    roundedOverage: prevRoundedOverage,
  } = getUsageFromBalance({
    ent,
    price,
    balance: prevBalance,
  });

  const { roundedOverage: overageWithReplaceables } = getUsageFromBalance({
    ent,
    price,
    balance: prevBalance - numReplaceables,
  });

  // logger.info(`Handling quantity increase`);
  // logger.info(
  //   `Prev overage: ${prevOverage} -> ${newOverage}, [Replaceables: ${numReplaceables}]`,
  // );
  // logger.info(`Usage:   ${prevRoundedUsage} -> ${newRoundedUsage}`);

  // Get price for usage...
  let prevPrice = priceToInvoiceAmount({
    price,
    overage: overageWithReplaceables,
  });

  let newPrice = priceToInvoiceAmount({
    price,
    overage: newRoundedOverage,
  });

  return {
    newUsage,
    prevUsage,

    prevRoundedUsage,
    newRoundedUsage,

    prevPrice,
    newPrice,
    prevOverage,
    prevRoundedOverage,
    newRoundedOverage,
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

  const { prevPrice, newPrice, newRoundedUsage, newUsage, prevUsage } =
    getPrevAndNewPriceForUpgrade({
      ent: cusEnt.entitlement,
      numReplaceables: cusEnt.replaceables.length,
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

  logger.info(`Prev price: ${prevPrice}, New price: ${newPrice}`);

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

  // Replaceables used
  let usageDiff = newUsage - prevUsage;
  let deletedReplaceables = cusEnt.replaceables.slice(0, usageDiff);

  let deleted = await RepService.deleteInIds({
    db,
    ids: deletedReplaceables.map((r) => r.id),
  });

  await stripeCli.subscriptionItems.update(subItem.id, {
    quantity: newRoundedUsage,
    proration_behavior: "none",
  });

  logger.info(`Updated sub item ${subItem.id} to quantity: ${newRoundedUsage}`);
  return { deletedReplaceables: deleted, invoice };
};
