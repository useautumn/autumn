import {
	type AppEnv,
	type FixedPriceConfig,
	type FullProduct,
	type Price,
	RewardType,
	type UsagePriceConfig,
} from "@autumn/shared";
import {
	isFixedPrice,
	isUsagePrice,
} from "@shared/utils/productUtils/priceUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { logger as loggerType } from "@/external/logtail/logtailUtils.js";
import type { JobName } from "@/queue/JobName.js";
import type { Payloads } from "@/queue/queueUtils.js";
import { RewardService } from "../rewards/RewardService.js";

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
	candidates: Price[],
): Price | null => {
	const oldConfig = oldPrice.config as FixedPriceConfig;

	return (
		candidates.find((candidate) => {
			const newConfig = candidate.config as FixedPriceConfig;
			return newConfig.amount === oldConfig.amount;
		}) || null
	);
};

// Match usage prices by feature and billing characteristics
const findMatchingUsagePrice = (
	oldPrice: Price,
	candidates: Price[],
): Price | null => {
	const oldConfig = oldPrice.config as UsagePriceConfig;

	return (
		candidates.find((candidate) => {
			const newConfig = candidate.config as UsagePriceConfig;

			// Match by feature
			if (newConfig.feature_id !== oldConfig.feature_id) return false;
			if (newConfig.internal_feature_id !== oldConfig.internal_feature_id)
				return false;

			// Match by billing behavior
			if (newConfig.bill_when !== oldConfig.bill_when) return false;
			if (newConfig.should_prorate !== oldConfig.should_prorate) return false;

			// Optionally match by tier structure
			if (!tiersMatch(oldConfig.usage_tiers, newConfig.usage_tiers))
				return false;

			return true;
		}) || null
	);
};

// Main matching function with type-specific logic
const findBestMatch = (oldPrice: Price, newPrices: Price[]): Price | null => {
	// First, filter by basic characteristics
	const candidates = newPrices.filter(
		(newPrice) =>
			newPrice.config.type === oldPrice.config.type &&
			newPrice.config.interval === oldPrice.config.interval &&
			newPrice.config.interval_count === oldPrice.config.interval_count,
	);

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
	logger
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
					oldPrices.map((p) => p.id).includes(p),
				),
		);

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
						logger.info(
							`Matched ${oldPrice.id} -> ${matchingNewPrice.id} (${oldPrice.config.type})`,
						);
					} else {
						unmatchedPrices.push(oldPrice.id);
						logger.warn(
							`No match found for price ${oldPrice.id} (${oldPrice.config.type})`,
						);
					}
				}
			}

			// Update the reward with new price IDs
			if (newPriceIds.length > 0) {
				try {
					await RewardService.update({
						db,
						internalId: reward.internal_id!,
						env,
						orgId,
						update: {
							discount_config: {
								discount_value: reward.discount_config!.discount_value,
								duration_type: reward.discount_config!.duration_type,
								duration_value: reward.discount_config!.duration_value,
								should_rollover: reward.discount_config!.should_rollover,
								apply_to_all: reward.discount_config!.apply_to_all,
								// Note: I used to include unmatchedPrices as a safety precaution, but it seems unecessary 
								// price_ids: [...unmatchedPrices, ...newPriceIds],
								price_ids: newPriceIds,
							},
						},
					});
					logger.info(
						`Updated reward "${reward.name}" (${reward.id}) with ${newPriceIds.length} prices`,
					);
				} catch (error) {
					logger.error(`Failed to update reward ${reward.id}:`, error);
				}
			} else {
				logger.warn(
					`Reward "${reward.name}" (${reward.id}) has no matching prices - skipping update`,
				);
			}

			if (unmatchedPrices.length > 0) {
				logger.warn(
					`Unmatched prices for reward ${reward.id}:`,
					unmatchedPrices,
				);
			}
		}

		// Migration summary
		const totalRewards = filteredRewards.length;
		const updatedRewards = filteredRewards.filter((r) =>
			r.discount_config?.price_ids?.some(
				(priceId) =>
					oldPrices.find((p) => p.id === priceId) &&
					findBestMatch(oldPrices.find((p) => p.id === priceId)!, newPrices),
			),
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
