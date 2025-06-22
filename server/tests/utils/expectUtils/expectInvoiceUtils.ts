import { DrizzleCli } from "@/db/initDrizzle.js";
import {
  cusProductToPrices,
  cusProductToEnts,
} from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { getPriceEntitlement } from "@/internal/products/prices/priceUtils.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import {
  Organization,
  BillingInterval,
  UsagePriceConfig,
} from "@autumn/shared";
import { AppEnv } from "autumn-js";
import { Decimal } from "decimal.js";
import Stripe from "stripe";
import { getSubsFromCusId } from "./expectSubUtils.js";
import { isFixedPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";

export const getExpectedInvoiceTotal = async ({
  customerId,
  productId,
  usage,
  stripeCli,
  db,
  org,
  env,
  onlyIncludeMonthly = false,
  onlyIncludeUsage = false,
  expectExpired = false,
}: {
  customerId: string;
  productId: string;
  usage: {
    featureId: string;
    entityFeatureId?: string;
    value: number;
  }[];
  stripeCli: Stripe;
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  onlyIncludeMonthly?: boolean;
  onlyIncludeUsage?: boolean;
  expectExpired?: boolean;
}) => {
  const { cusProduct } = await getSubsFromCusId({
    stripeCli,
    customerId,
    productId,
    db,
    org,
    env,
    withExpired: expectExpired,
  });

  const prices = cusProductToPrices({ cusProduct });
  const ents = cusProductToEnts({ cusProduct });

  let total = new Decimal(0);
  for (const price of prices) {
    if (onlyIncludeMonthly && price.config.interval != BillingInterval.Month) {
      continue;
    }

    if (onlyIncludeUsage && isFixedPrice({ price })) continue;

    const config = price.config as UsagePriceConfig;
    const featureId = config.feature_id;
    const ent = getPriceEntitlement(price, ents);

    const usageAmount = usage.find(
      (u) =>
        u.featureId == featureId &&
        (u.entityFeatureId ? u.entityFeatureId == ent.entity_feature_id : true),
    )?.value;

    const overage =
      usageAmount && ent.allowance ? usageAmount - ent.allowance : usageAmount;

    const invoiceAmt = priceToInvoiceAmount({
      price,
      overage,
    });

    total = total.plus(invoiceAmt);
  }

  return total.toNumber();
};
