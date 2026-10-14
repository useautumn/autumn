import {
	type FixedPriceConfig,
	isUsagePrice,
	type Price,
	type Reward,
	type RewardType,
	type UsagePriceConfig,
	type UsageTier,
} from "../../index.js";
import { getBillingType } from "../productUtils/priceUtils";
import { isFixedPrice } from "../productUtils/priceUtils/classifyPriceUtils";

const tiersMatch = (oldTiers: UsageTier[], newTiers: UsageTier[]): boolean => {
	if (oldTiers.length !== newTiers.length) return false;

	return oldTiers.every((oldTier, index) => {
		const newTier = newTiers[index];
		return (
			oldTier.to === newTier.to &&
			oldTier.amount === newTier.amount &&
			(oldTier.flat_amount ?? 0) === (newTier.flat_amount ?? 0)
		);
	});
};

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

const findMatchingUsagePrice = (
	oldPrice: Price,
	candidates: Price[],
): Price | null => {
	const oldConfig = oldPrice.config as UsagePriceConfig;

	return (
		candidates.find((candidate) => {
			if (!isUsagePrice({ price: candidate })) return false;

			const newConfig = candidate.config as UsagePriceConfig;

			if (newConfig.feature_id !== oldConfig.feature_id) return false;
			if (newConfig.internal_feature_id !== oldConfig.internal_feature_id)
				return false;

			const newBilingType = getBillingType(newConfig);
			const oldBilingType = getBillingType(oldConfig);
			if (newBilingType !== oldBilingType) return false;

			if (!tiersMatch(oldConfig.usage_tiers, newConfig.usage_tiers))
				return false;

			return true;
		}) || null
	);
};

const findBestMatch = (oldPrice: Price, newPrices: Price[]): Price | null => {
	const candidates = newPrices.filter(
		(newPrice) =>
			newPrice.config.type === oldPrice.config.type &&
			newPrice.config.interval === oldPrice.config.interval &&
			newPrice.config.interval_count === oldPrice.config.interval_count,
	);

	if (candidates.length === 0) return null;
	if (candidates.length === 1) return candidates[0];

	if (isFixedPrice(oldPrice)) {
		return findMatchingFixedPrice(oldPrice, candidates);
	} else if (isUsagePrice({ price: oldPrice })) {
		return findMatchingUsagePrice(oldPrice, candidates);
	}

	return candidates[0];
};

export interface RewardMigrationResult {
	willMigrateCount: number;
	willNotMigrateCount: number;
}

export interface RewardPriceAnalysisResult {
	validPriceCount: number;
	invalidPriceCount: number;
}

export function analyzeRewardMigration({
	rewards,
	oldPrices,
	newPrices,
	rewardTypesToCheck,
}: {
	rewards: Reward[];
	oldPrices: Price[];
	newPrices: Price[];
	rewardTypesToCheck: RewardType[];
}): RewardMigrationResult {
	let willMigrateCount = 0;
	let willNotMigrateCount = 0;

	const relevantRewards = rewards.filter(
		(reward) =>
			rewardTypesToCheck.includes(reward.type) &&
			reward.discount_config?.price_ids &&
			reward.discount_config.price_ids.length > 0,
	);

	for (const reward of relevantRewards) {
		if (!reward.discount_config?.price_ids) continue;

		for (const priceId of reward.discount_config.price_ids) {
			const oldPrice = oldPrices.find((p) => p.id === priceId);
			if (!oldPrice) {
				continue;
			}

			const matchingNewPrice = findBestMatch(oldPrice, newPrices);

			if (matchingNewPrice) {
				willMigrateCount++;
			} else {
				willNotMigrateCount++;
			}
		}
	}

	return {
		willMigrateCount,
		willNotMigrateCount,
	};
}

export function analyzeRewardPrices({
	reward,
	availablePriceIds,
}: {
	reward: Reward;
	availablePriceIds: string[];
}): RewardPriceAnalysisResult {
	let validPriceCount = 0;
	let invalidPriceCount = 0;

	if (reward.discount_config?.apply_to_all) {
		return { validPriceCount: 0, invalidPriceCount: 0 };
	}

	if (reward.discount_config?.price_ids) {
		for (const priceId of reward.discount_config.price_ids) {
			if (availablePriceIds.includes(priceId)) {
				validPriceCount++;
			} else {
				invalidPriceCount++;
			}
		}
	}

	return {
		validPriceCount,
		invalidPriceCount,
	};
}
