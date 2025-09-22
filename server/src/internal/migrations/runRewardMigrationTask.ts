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

  console.log(
    "Candidates: ",
    candidates.map((p) => formatPrice({ price: p }))
  );
  console.log("--------------------------------");

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
      newPrices,
      orgId,
      env,
    }: {
      oldPrices: Price[];
      newPrices: Price[];
      product: FullProduct;
      orgId: string;
      env: AppEnv;
    } = payload;

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

    // console.log(
    //   "New price IDs: ",
    //   newPrices.map((p) => formatPrice({ price: p }))
    // );
    for (const reward of filteredRewards) {
      const newPriceIds: string[] = [];
      const unmatchedPrices: string[] = [];

      if (reward.discount_config?.price_ids) {
        for (const priceId of reward.discount_config.price_ids) {
          const oldPrice = oldPrices.find((p) => p.id === priceId);
          if (!oldPrice) {
            logger.warn(`Old price ${priceId} not found in oldPrices array`);
            continue;
          }

          const matchingNewPrice = findBestMatch(oldPrice, newPrices);

          if (matchingNewPrice) {
            newPriceIds.push(matchingNewPrice.id);
          } else {
            unmatchedPrices.push(oldPrice.id);
          }
        }
      }

      console.log("New price IDs: ", newPriceIds);
      throw new Error("test");

      // Update the reward with new price IDs
      if (newPriceIds.length > 0) {
        try {
          // Check if price IDs have actually changed
          const originalPriceIds = reward.discount_config?.price_ids || [];
          const priceIdsChanged =
            originalPriceIds.length !== newPriceIds.length ||
            !originalPriceIds.every((id) => newPriceIds.includes(id));

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

          // Update Stripe coupon if price IDs have changed
          if (priceIdsChanged && org) {
            try {
              logger.info(
                `Price IDs changed for reward ${reward.id}, updating Stripe coupon...`
              );

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

              logger.info(
                `Successfully updated Stripe coupon for reward ${reward.id} with new product restrictions`
              );
            } catch (stripeError) {
              logger.error(
                `Failed to update Stripe coupon for reward ${reward.id}:`,
                stripeError
              );
              // Don't throw here - we want to continue with other rewards
            }
          }
          logger.info(
            `Updated reward "${reward.name}" (${reward.id}) with ${newPriceIds.length} prices`
          );
        } catch (error) {
          logger.error(`Failed to update reward ${reward.id}:`, error);
        }
      }

      if (unmatchedPrices.length > 0) {
        logger.warn(
          `Unmatched prices for reward ${reward.id}:`,
          unmatchedPrices
        );
      }
    }

    // Migration summary
    const totalRewards = filteredRewards.length;
    const updatedRewards = filteredRewards.filter((r) =>
      r.discount_config?.price_ids?.some(
        (priceId) =>
          oldPrices.find((p) => p.id === priceId) &&
          findBestMatch(oldPrices.find((p) => p.id === priceId)!, newPrices)
      )
    ).length;

    logger.info("================================");
    logger.info("REWARD MIGRATION SUMMARY FOR ORG: ", orgId);
    logger.info("================================");
    logger.info(`Total rewards processed: ${totalRewards}`);
    logger.info(`Rewards with successful matches: ${updatedRewards}`);
    logger.info(`Rewards with no matches: ${totalRewards - updatedRewards}`);
    logger.info("================================");
  } catch (error) {
    logger.error("Error running reward migration task", { error });
    throw error;
  }
}
