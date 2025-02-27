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
import {
  getBillingType,
  getPriceForOverage,
} from "@/internal/prices/priceUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  getInAdvanceSub,
  getStripeSubs,
} from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { format } from "date-fns";
import { Decimal } from "decimal.js";

type CusEntWithCusProduct = FullCustomerEntitlement & {
  customer_product: CusProduct;
};

export const adjustAllowance = async ({
  sb,
  env,
  org,
  affectedFeature,
  cusEnt,
  cusPrices,
  event,
  customer,
  originalBalance,
  deduction,
}: {
  sb: SupabaseClient;
  env: AppEnv;
  affectedFeature: Feature;
  org: Organization;
  cusEnt: CusEntWithCusProduct;
  cusPrices: FullCustomerPrice[];
  event: Event;
  customer: Customer;
  originalBalance: number;
  deduction: number;
}) => {
  // Get customer entitlement

  console.log(`Adjusting allowance for ${cusEnt.entitlement.feature.name}`);
  console.log(`Customer: ${customer.name} (${customer.id}), Org: ${org.slug}`);

  let relatedCusPrice = getRelatedCusPrice(cusEnt, cusPrices);

  if (!relatedCusPrice || !cusEnt.customer_product) {
    console.log("No related cus price / cus product found");
    return;
  }

  // Get sub
  let stripeCli = createStripeCli({ org, env });
  const stripeSubs = await getStripeSubs({
    stripeCli,
    subIds: cusEnt.customer_product.subscription_ids!,
  });

  let stripeSub = stripeSubs[0];

  let priceConfig = relatedCusPrice.price.config as UsagePriceConfig;
  let subItem = stripeSub.items.data.find(
    (item) => item.price.id === priceConfig.stripe_price_id
  );

  let originalUsage = new Decimal(cusEnt.entitlement.allowance!)
    .minus(originalBalance)
    .toNumber();

  let newUsage = new Decimal(originalUsage).plus(deduction).toNumber();
  console.log(`Original usage: ${originalUsage}`);
  console.log("New usage:", newUsage);
  let featureName = affectedFeature.name;

  subItem = await stripeCli.subscriptionItems.create({
    subscription: stripeSub.id,
    price: priceConfig.stripe_price_id!,
    quantity: originalUsage,
    proration_date: stripeSub.current_period_end,
  });

  await stripeCli.subscriptionItems.update(subItem.id, {
    quantity: newUsage,
    proration_behavior: "create_prorations",
  });

  // if (!subItem) {
  //   console.log(
  //     `Creating sub item for feature ${featureName} ${originalUsage}`
  //   );
  //   subItem = await stripeCli.subscriptionItems.create({
  //     subscription: stripeSub.id,
  //     price: priceConfig.stripe_price_id!,
  //     quantity: newUsage,
  //     proration_behavior: "create_prorations",
  //   });
  // } else {
  //   subItem = await stripeCli.subscriptionItems.create({
  //     subscription: stripeSub.id,
  //     price: priceConfig.stripe_price_id!,
  //     quantity: originalUsage,
  //     proration_date: stripeSub.current_period_end,
  //   });

  //   await stripeCli.subscriptionItems.update(subItem.id, {
  //     quantity: newUsage,
  //     proration_behavior: "create_prorations",
  //   });
  // }

  await stripeCli.subscriptionItems.del(subItem.id, {
    proration_date: stripeSub.current_period_end,
  });

  // await stripeCli.subscriptionItems.update(subItem.id, {
  //   proration_date: stripeSub.current_period_end,
  //   quantity: 0,
  // });

  // console.log(`Updated sub item quantity to 0 for period end`);
};
