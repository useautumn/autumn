import {
  type AppEnv,
  type FixedPriceConfig,
  type FullProduct,
  type Price,
  type UsagePriceConfig,
  DiscountConfig,
  PriceType,
  RewardType,
  getBillingType,
  isFixedPrice,
  isUsagePrice,
} from "@autumn/shared";

import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { logger as loggerType } from "@/external/logtail/logtailUtils.js";
import type { JobName } from "@/queue/JobName.js";
import type { Payloads } from "@/queue/queueUtils.js";
import { RewardService } from "../rewards/RewardService.js";
import { tiersAreSame } from "../products/prices/priceInitUtils.js";
import { createStripeCoupon } from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import { PriceService } from "../products/prices/PriceService.js";
import { OrgService } from "../orgs/OrgService.js";
import { formatPrice } from "../products/prices/priceUtils.js";
import { ProductService } from "../products/ProductService.js";

// Helper function to check if tier structures match
const tiersMatch = (oldTiers: any[], newTiers: any[]): boolean => {
  if (oldTiers.length !== newTiers.length) return false;

  return oldTiers.every((oldTier, index) => {
    const newTier = newTiers[index];
    return oldTier.to === newTier.to && oldTier.amount === newTier.amount;
  });
};

// Match fixed prices by amount
const findMatchingFixedPrice = (
  oldPrice: Price,
  candidates: Price[]
): Price | null => {
  const oldConfig = oldPrice.config as FixedPriceConfig;

  const possibleCandidate = candidates.find((candidate) => {
    const newConfig = candidate.config as FixedPriceConfig;
    return newConfig.amount === oldConfig.amount;
  });

  return possibleCandidate || candidates?.[0];
};

// Match usage prices by feature and billing characteristics
const findMatchingUsagePrice = (
  oldPrice: Price,
  candidates: Price[]
): Price | null => {
  const oldConfig = oldPrice.config as UsagePriceConfig;

  return (
    candidates.find((candidate) => {
      const newConfig = candidate.config as UsagePriceConfig;

      // Match by feature
      if (newConfig.internal_feature_id !== oldConfig.internal_feature_id)
        return false;

      // Match by billing behavior
      let newBillingType = getBillingType(newConfig);
      let oldBillingType = getBillingType(oldConfig);
      if (newBillingType !== oldBillingType) return false;

      // Optionally match by tier structure
      // if (!tiersMatch(oldConfig.usage_tiers, newConfig.usage_tiers))
      if (!tiersAreSame(oldConfig.usage_tiers, newConfig.usage_tiers))
        return false;

      return true;
    }) || null
  );
};

// Main matching function with type-specific logic
const findBestMatch = (oldPrice: Price, newPrices: Price[]): Price | null => {
  // First, filter by basic characteristics

  const candidates = newPrices.filter((newPrice) => {
    if (newPrice.id === oldPrice.id) return true;

    const oldConfig = oldPrice.config as UsagePriceConfig;
    const newConfig = newPrice.config as UsagePriceConfig;

    return (
      getBillingType(newPrice.config) === getBillingType(oldPrice.config) &&
      newPrice.config.interval === oldPrice.config.interval &&
      newPrice.config.interval_count === oldPrice.config.interval_count &&
      (oldConfig.type == PriceType.Usage
        ? oldConfig.internal_feature_id === newConfig.internal_feature_id
        : true)
    );
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // If multiple candidates, use type-specific matching
  if (isFixedPrice({ price: oldPrice })) {
    return findMatchingFixedPrice(oldPrice, candidates);
  } else if (isUsagePrice({ price: oldPrice })) {
    return findMatchingUsagePrice(oldPrice, candidates);
  }

  // Fallback to first candidate
  return candidates[0];
};

export async function runRewardMigrationTask({
  db,
  payload,
  logger,
}: {
  db: DrizzleCli;
  payload: Payloads[JobName.RewardMigration];
  logger: ReturnType<typeof loggerType.child>;
}) {
  try {
    const {
      oldPrices,
      productId,
      // newPrices,
      orgId,
      env,
    }: {
      oldPrices: Price[];
      // newPrices: Price[];
      productId: string;
      orgId: string;
      env: AppEnv;
    } = payload;

    const fullProduct = await ProductService.getFull({
      db,
      idOrInternalId: productId,
      orgId,
      env,
    });

    const newPrices = fullProduct.prices;

    // Get organization for Stripe operations
    const org = await OrgService.get({
      db,
      orgId,
    });

    const rewards = await RewardService.list({
      db,
      orgId,
      env,
      inTypes: [
        RewardType.PercentageDiscount,
        RewardType.FixedDiscount,
        RewardType.InvoiceCredits,
      ],
    });

    const filteredRewards = rewards.filter(
      (x) =>
        x.org_id === orgId &&
        x.env === env &&
        x.type !== RewardType.FreeProduct &&
        x.discount_config &&
        x.discount_config.price_ids?.some((p) =>
          oldPrices.map((p) => p.id).includes(p)
        )
    );

    let shouldUpdateReward = false;

    for (const reward of filteredRewards) {
      const newPriceIds: string[] = [];
      const unmatchedPrices: string[] = [];

      if (reward.discount_config?.price_ids) {
        for (const priceId of reward.discount_config.price_ids) {
          const oldPrice = oldPrices.find((p) => p.id === priceId);

          // From other product
          if (!oldPrice) {
            newPriceIds.push(priceId);
            continue;
          }

          const matchingNewPrice = findBestMatch(oldPrice, newPrices);

          if (matchingNewPrice) {
            newPriceIds.push(matchingNewPrice.id);
            const shouldUpdate =
              matchingNewPrice.config.stripe_price_id !==
                oldPrice.config.stripe_price_id ||
              matchingNewPrice.config.stripe_product_id !==
                oldPrice.config.stripe_product_id;

            if (shouldUpdate) {
              shouldUpdateReward = true;
            }
          } else {
            unmatchedPrices.push(oldPrice.id);
          }
        }
      }

      // Update the reward with new price IDs
      if (shouldUpdateReward) {
        try {
          // Update Stripe coupon and reward if price IDs have changed
          console.log(
            `Updating ${reward.id}, updating reward and Stripe coupon...`
          );

          // Update the reward in the database
          const updatedReward = await RewardService.update({
            db,
            internalId: reward.internal_id!,
            env,
            orgId,
            update: {
              discount_config: {
                ...(reward.discount_config as DiscountConfig),
                price_ids: newPriceIds,
              },
            },
          });

          // Get the price objects for the new price IDs
          const prices = await PriceService.getInIds({
            db,
            ids: newPriceIds,
          });

          // Recreate the Stripe coupon with new product restrictions
          await createStripeCoupon({
            reward: updatedReward,
            org,
            env,
            prices,
            logger,
          });

          console.log(
            `Successfully updated Stripe coupon for reward ${reward.id} with new product restrictions`
          );
        } catch (error) {
          console.error(`Failed to update reward ${reward.id}:`, error);
        }
      }

      if (unmatchedPrices.length > 0) {
        console.warn(
          `Unmatched prices for reward ${reward.id}:`,
          unmatchedPrices
        );
      }
    }
  } catch (error) {
    console.error("Error running reward migration task", { error });
    throw error;
  }
}
