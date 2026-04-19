import {
	type Feature,
	FeatureType,
	type FrontendOrg,
	formatAmount,
	formatInterval,
	Infinite,
	type ProductItem,
	ProductItemType,
	TierBehavior,
} from "@autumn/shared";
import { notNullish } from "@/utils/genUtils";
import { getFeature } from "../entitlementUtils";
import { getItemType, intervalIsNone } from "../productItemUtils";

const isVolumeFlatAmountItem = (item: ProductItem): boolean => {
	if (item.tier_behavior !== TierBehavior.VolumeBased) return false;
	if (!item.tiers || item.tiers.length === 0) return false;
	return (
		item.tiers.every((t) => t.amount === 0) &&
		item.tiers.some((t) => (t.flat_amount ?? 0) > 0)
	);
};

const formatFlatAmountTierRange = ({
	item,
	currency,
}: {
	item: ProductItem;
	currency: string;
}): string => {
	const tiers = item.tiers;
	if (!tiers) return "";
	const format = (amount: number) => formatAmount({ currency, amount });

	if (tiers.length === 1) return format(tiers[0].flat_amount ?? 0);

	const first = tiers[0].flat_amount ?? 0;
	const last = tiers[tiers.length - 1].flat_amount ?? 0;
	return `${format(first)} - ${format(last)}`;
};

// Can probably delete this...
const getPaidFeatureString = ({
	item,
	currency = "USD",
	features,
}: {
	item: ProductItem;
	currency?: string;
	features: Feature[];
}) => {
	const feature = features.find((f: Feature) => f.id === item.feature_id);

	if (isVolumeFlatAmountItem(item)) {
		let result = formatFlatAmountTierRange({ item, currency });
		result += ` for ${feature?.name}`;

		if (!intervalIsNone(item.interval)) {
			const intervalStr = formatInterval({
				interval: item.interval ?? undefined,
				intervalCount: item.interval_count ?? undefined,
			});
			result += ` ${intervalStr}`;
		}

		if (item.included_usage) {
			return `${item.included_usage} ${feature?.name} free, then ${result}`;
		}
		return result;
	}

	let amountStr = "";

	if (item.price) {
		amountStr = formatAmount({
			currency,
			amount: item.price,
		});
	} else if (item.tiers && item.tiers.length === 1) {
		amountStr = formatAmount({
			currency,
			amount: item.tiers[0].amount,
		});
	} else if (item.tiers) {
		amountStr = `${formatAmount({
			currency,
			amount: item.tiers[0].amount,
		})} - ${formatAmount({
			currency,
			amount: item.tiers[item.tiers.length - 1].amount,
		})}`;
	}

	amountStr += ` per ${item.billing_units! > 1 ? item.billing_units : ""} ${
		feature?.name
	}`;

	if (!intervalIsNone(item.interval)) {
		const intervalStr = formatInterval({
			interval: item.interval ?? undefined,
			intervalCount: item.interval_count ?? undefined,
		});
		amountStr += ` ${intervalStr}`;
	}

	if (item.included_usage) {
		return `${item.included_usage} ${feature?.name} free, then ${amountStr}`;
	}
	return amountStr;
};

const getFixedPriceString = ({
	item,
	currency = "USD",
}: {
	item: ProductItem;
	currency?: string;
}) => {
	const formattedAmount = formatAmount({
		currency,
		amount: item.price!,
	});

	if (!intervalIsNone(item.interval)) {
		const intervalStr = formatInterval({
			interval: item.interval ?? undefined,
			intervalCount: item.interval_count ?? undefined,
		});
		return `${formattedAmount} ${intervalStr}`;
	}

	return `${formattedAmount}`;
};

const getFeatureString = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	const feature = features.find((f: Feature) => f.id == item.feature_id);

	if (feature?.type === FeatureType.Boolean) {
		return `${feature.name}`;
	}

	if (item.included_usage == Infinite) {
		return `Unlimited ${feature?.name}`;
	}

	const intervalStr = formatInterval({
		interval: item.interval ?? undefined,
		intervalCount: item.interval_count ?? undefined,
	});

	return `${item.included_usage ?? 0} ${feature?.name}${item.entity_feature_id ? ` per ${getFeature(item.entity_feature_id, features)?.name}` : ""}${notNullish(item.interval) ? ` ${intervalStr}` : ""}`;
};

export const formatProductItemText = ({
	item,
	org,
	features,
}: {
	item: ProductItem;
	org?: FrontendOrg;
	features: Feature[];
}) => {
	if (!item) return "";

	const itemType = getItemType(item);

	if (itemType == ProductItemType.FeaturePrice) {
		return getPaidFeatureString({
			item,
			currency: org?.default_currency,
			features,
		});
	} else if (itemType == ProductItemType.Price) {
		return getFixedPriceString({ item, currency: org?.default_currency });
	}
};
