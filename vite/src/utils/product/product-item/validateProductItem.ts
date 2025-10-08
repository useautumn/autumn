import {
	type Feature,
	FeatureUsageType,
	type FrontendProductItem,
	type RolloverConfig,
	RolloverDuration,
} from "@autumn/shared";
import { toast } from "sonner";
import { invalidNumber, notNullish, nullish } from "@/utils/genUtils";
import { isFeatureItem, isFeaturePriceItem } from "../getItemType";

export const validateProductItem = ({
	item,
	features,
}: {
	item: FrontendProductItem;
	features: Feature[];
}) => {
	const feature = features.find((f) => f.id === item.feature_id);

	// Sanitize product item
	if (
		feature &&
		feature.config?.usage_type === FeatureUsageType.Continuous &&
		isFeatureItem(item)
	) {
		item.interval = null;
	}

	if (item.isPrice && item.isVariable && !item.feature_id) {
		toast.error("Please select a feature");
		return null;
	}

	if (notNullish(item.price)) {
		if (invalidNumber(item.price)) {
			toast.error("Please enter a valid price amount");
			return null;
		}

		if (item.price === 0) {
			toast.error("Price should be greater than 0");
			return null;
		}

		item.price = parseFloat(item.price.toString());
	}

	if (!invalidNumber(item.included_usage)) {
		item.included_usage = Number(item.included_usage);
		
		// Check if included usage is negative
		if (item.included_usage < 0) {
			toast.error("Included usage must be 0 or greater");
			return null;
		}
	}

	if (isFeaturePriceItem(item) && nullish(item.usage_model)) {
		toast.error("Please select a usage model");
		return null;
	}

	if (item.tiers && item.price) item.price = null;

	if (item.tiers) {
		let previousTo = 0;

		const allFree = item.tiers.every((tier) => tier.amount === 0);

		if (allFree) {
			if (item.tiers.length === 1) {
				toast.error("Price should be greater than 0");
			} else {
				toast.error("Should have at least one tier with price greater than 0");
			}
			return null;
		}

		const freeTier =
			item.tiers.length > 0 && item.tiers[0].amount === 0
				? item.tiers[0]
				: null;

		// const includedUsage = parseFloat(item.included_usage?.toString() || "0");

		let finalTiers = item.tiers;

		if (freeTier) {
			finalTiers = finalTiers.slice(1);
			item.included_usage = parseFloat(freeTier.to.toString() || "0");

			finalTiers = finalTiers.map((tier) => {
				tier.amount -= freeTier.amount;
				return tier;
			});
		}

		for (let i = 0; i < finalTiers.length; i++) {
			const tier = finalTiers[i];

			// Check if amount is actually a number
			if (typeof tier.amount !== "number") {
				tier.amount = parseFloat(tier.amount);
			}

			// Check if amount is valid
			if (invalidNumber(tier.amount)) {
				toast.error("Please enter valid prices for all tiers");
				return null;
			}

			// Check if amount is negative
			if (tier.amount < 0) {
				toast.error("Please set a positive usage price");
				return null;
			}

			// Skip other validations if 'to' is "inf"
			if (tier.to === "inf") {
				continue;
			}

			tier.to = Number(tier.to);

			// Check if 'to' is a number and valid
			if (typeof tier.to !== "number" || invalidNumber(tier.to)) {
				toast.error("Please enter valid usage limits for all tiers");
				return null;
			}

			// Ensure tiers are in ascending order
			if (tier.to < previousTo) {
				toast.error("Tiers must be in ascending order");
				return null;
			}

			if (tier.to == previousTo) {
				toast.error(`tier ${i + 1} should have a greater 'to'`);
				return null;
			}

			previousTo = tier.to;
		}

		item.tiers = finalTiers;
	}

	// Validate billing units
	if (item.billing_units && invalidNumber(item.billing_units)) {
		toast.error("Please enter valid billing units");
		return null;
	} else {
		if (isFeaturePriceItem(item)) {
			item.billing_units = Number(item.billing_units);
		} else {
			item.billing_units = undefined;
		}
	}

	if (item.config?.rollover) {
		const rollover = item.config?.rollover as RolloverConfig;

		if (rollover.max && rollover.max !== null) {
			rollover.max = parseFloat(rollover.max.toString());
		}

		if (rollover.duration !== RolloverDuration.Forever) {
			rollover.length = parseFloat(rollover.length.toString());
		} else {
			rollover.length = 0;
		}

		if (
			item.interval === null ||
			nullish(item.included_usage) ||
			item.included_usage === 0
		) {
			item.config!.rollover = null;
			return item;
		}

		if (rollover.max !== null && invalidNumber(rollover.max)) {
			toast.error("Please enter a valid maximum rollover amount");
			return null;
		}

		if (invalidNumber(rollover.length)) {
			toast.error("Please enter a valid rollover duration");
			item.config.rollover = undefined;
			return null;
		}

		// if (rollover.duration != RolloverDuration.Month) {
		//   toast.error("Rollovers currently only support monthly cycles.");
		//   item.config.rollover = undefined;
		//   return null;
		// }

		if (typeof rollover.max == "number" && rollover.max < 0) {
			toast.error("Please enter a positive rollover max amount");
			item.config.rollover = undefined;
			return null;
		}

		if (rollover.duration == RolloverDuration.Month && rollover.length < 0) {
			toast.error("Please enter a positive rollover length");
			item.config.rollover = undefined;
			return null;
		}
	}

	return item;
};
