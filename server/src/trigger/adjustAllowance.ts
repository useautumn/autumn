import { FullCustomerEntitlement } from "@shared/models/cusModels/cusEntModels/cusEntitlementModels.js";
import {
  AppEnv,
  BillingType,
  CusProduct,
  Customer,
  ErrCode,
  Event,
  Feature,
  FullCustomerPrice,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import chalk from "chalk";
import { getMeteredDeduction } from "./deductUtils.js";
import { getRelatedCusPrice } from "@/internal/customers/entitlements/cusEntUtils.js";
import { getBillingType } from "@/internal/prices/priceUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  getInAdvanceSub,
  getStripeSubs,
} from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";

type CusEntWithCusProduct = FullCustomerEntitlement & {
  customer_product: CusProduct;
};

export const adjustAllowance = async ({
  sb,
  env,
  org,
  affectedFeature,
  cusEnts,
  event,
  cusPrices,
  customer,
}: {
  sb: SupabaseClient;
  env: AppEnv;
  affectedFeature: Feature;
  org: Organization;
  cusEnts: FullCustomerEntitlement[];
  event: Event;
  cusPrices: FullCustomerPrice[];
  customer: Customer;
}) => {
  // Get customer entitlement
  let cusEnt, cusPrice;
  for (const ce of cusEnts) {
    let relatedCusPrice = getRelatedCusPrice(ce, cusPrices);

    if (!relatedCusPrice) {
      continue;
    }

    let priceConfig = relatedCusPrice.price.config as UsagePriceConfig;
    if (getBillingType(priceConfig) !== BillingType.UsageInAdvance) {
      continue;
    }

    cusEnt = ce;
    cusPrice = relatedCusPrice;
    break;
  }

  if (!cusEnt || !cusPrice) {
    console.log(
      `Customer: ${customer.name} (${customer.id}), Org: ${org.slug}`
    );
    console.log(
      "Not usage_in_advance price / entitlement found for feature",
      affectedFeature.id
    );
    return;
  }

  const deduction = getMeteredDeduction(affectedFeature, event);
  console.log(
    `Adjusting allowance for feature: ${chalk.yellow(
      affectedFeature.id
    )}, Value: ${chalk.yellow(deduction)}`
  );

  // 1. Update subscription
  const cusProduct = (cusEnt as CusEntWithCusProduct).customer_product;
  if (!cusProduct) {
    console.log("❗️❗️❗️ ERROR: customer product not found");
  }

  const stripeCli = createStripeCli({
    org,
    env,
  });

  let subToUpdate = await getInAdvanceSub({
    stripeCli,
    subIds: cusProduct.subscription_ids!,
    feature: affectedFeature,
  });

  if (!subToUpdate) {
    console.log("No subscription to update");
    return;
  }

  let config = cusPrice.price.config as UsagePriceConfig;
  await stripeCli.subscriptions.update(subToUpdate.id, {
    items: [
      {
        id: subToUpdate.items.data[0].id,
        price: config.stripe_price_id!,
        quantity: subToUpdate.items.data[0].quantity + deduction,
      },
    ],
  });

  throw new Error("Not implemented");
};
