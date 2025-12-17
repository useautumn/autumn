import {
	AttachScenario,
	cusProductToProduct,
	ErrCode,
	type Feature,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	Infinite,
	numberWithCommas,
	type Organization,
	type ProductItem,
	ProductItemFeatureType,
	type ProductV2,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getFeatureName } from "@/internal/features/utils/displayUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { getFreeTrialAfterFingerprint } from "../free-trials/freeTrialUtils.js";
import { getLargestInterval } from "../prices/priceUtils/priceIntervalUtils.js";
import {
	isFeaturePriceItem,
	isPriceItem,
} from "../product-items/productItemUtils/getItemType.js";
import { isProductUpgrade } from "../productUtils.js";

export const sortProductItems = (items: ProductItem[], features: Feature[]) => {
	items.sort((a, b) => {
		const aIsPriceItem = isPriceItem(a);
		const bIsPriceItem = isPriceItem(b);

		if (aIsPriceItem && bIsPriceItem) {
			return 0;
		}

		if (aIsPriceItem && !bIsPriceItem) {
			return -1;
		}

		if (!aIsPriceItem && bIsPriceItem) {
			return 1;
		}

		// 2. Put feature price next
		const aIsFeatureItem = isFeaturePriceItem(a);
		const bIsFeatureItem = isFeaturePriceItem(b);

		if (aIsFeatureItem && !bIsFeatureItem) {
			return -1;
		}

		if (!aIsFeatureItem && bIsFeatureItem) {
			return 1;
		}

		// 3. Put feature price items in alphabetical order
		const feature = features.find((f) => f.id == a.feature_id);
		const aFeatureName = feature?.name;
		const bFeatureName = features.find((f) => f.id == b.feature_id)?.name;

		if (!aFeatureName || !bFeatureName) {
			return 0;
		}

		return aFeatureName.localeCompare(bFeatureName);
	});

	return items;
};

export const getIncludedFeatureName = ({
	item,
	feature,
}: {
	item: ProductItem;
	feature: Feature;
}) => {
	return getFeatureName({
		feature,
		plural: typeof item.included_usage === "number" && item.included_usage > 1,
	});
};

export const getPriceText = ({
	item,
	org,
}: {
	item: ProductItem;
	org: Organization;
}) => {
	const formatAmount = (amount: number) => {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: org.default_currency || "USD",
			minimumFractionDigits: 0,
			maximumFractionDigits: 10,
		}).format(amount);
	};
	if (item.price) {
		return formatAmount(item.price as number);
	}

	const tiers = item.tiers;
	if (tiers) {
		if (tiers.length == 1) {
			return formatAmount(tiers[0].amount);
		}

		const firstPrice = tiers[0].amount;
		const lastPrice = tiers[tiers.length - 1].amount;

		return `${formatAmount(firstPrice)} - ${formatAmount(lastPrice)}`;
	}
};

// Deprecate
export const getPricecnPrice = ({
	org,
	items,
	features,
	isMainPrice = true,
}: {
	org: Organization;
	features: Feature[];
	items: ProductItem[];
	isMainPrice?: boolean;
}) => {
	const priceExists = items.some(
		(i) => isPriceItem(i) || isFeaturePriceItem(i),
	);

	if (!priceExists) {
		return {
			primaryText: "Free",
			secondaryText: " ",
		};
	}

	const priceItem = items[0];

	if (isPriceItem(priceItem)) {
		return {
			...priceItem,
			primaryText: getPriceText({ item: priceItem, org }),
			secondaryText: priceItem.interval ? `per ${priceItem.interval}` : " ",
		};
	} else {
		const feature = features.find((f) => f.id == priceItem.feature_id);
		const texts = featurePricetoPricecnItem({
			feature,
			item: priceItem,
			org,
			isMainPrice,
		});
		return {
			...priceItem,
			primaryText: texts.primaryText,
			secondaryText: texts.secondaryText,
		};
	}
};

export const featureToPricecnItem = ({
	feature,
	item,
}: {
	feature?: Feature;
	item: ProductItem;
}) => {
	if (!feature) {
		throw new RecaseError({
			message: `Feature ${item.feature_id} not found`,
			code: ErrCode.FeatureNotFound,
			statusCode: 404,
		});
	}
	// 1. If feature
	if (item.feature_type == ProductItemFeatureType.Static) {
		return {
			primaryText: feature.name,
		};
	}

	const featureName = getIncludedFeatureName({
		feature,
		item,
	});

	const includedUsageTxt =
		item.included_usage == Infinite
			? "Unlimited "
			: nullish(item.included_usage) || item.included_usage == 0
				? ""
				: `${numberWithCommas(item.included_usage!)} `;

	return {
		primaryText: `${includedUsageTxt}${featureName}`,
	};
};

export const featurePricetoPricecnItem = ({
	feature,
	item,
	org,
	isMainPrice = false,
	withNameAfterIncluded = false,
}: {
	feature?: Feature;
	item: ProductItem;
	org: Organization;
	isMainPrice?: boolean;
	withNameAfterIncluded?: boolean;
}) => {
	if (!feature) {
		throw new RecaseError({
			message: `Feature ${item.feature_id} not found`,
			code: ErrCode.FeatureNotFound,
			statusCode: 404,
		});
	}

	// 1. Get included usage
	const includedFeatureName = getIncludedFeatureName({
		feature,
		item,
	});

	let includedUsageStr = "";
	if (notNullish(item.included_usage) && (item.included_usage as number) > 0) {
		const includedUsage = numberWithCommas(item.included_usage as number);
		if (withNameAfterIncluded) {
			includedUsageStr = `${includedUsage} ${includedFeatureName}`;
		} else {
			includedUsageStr = `${includedUsage} included`;
		}
	}

	const priceStr = getPriceText({ item, org });
	const billingFeatureName = getFeatureName({
		feature,
		plural: typeof item.billing_units == "number" && item.billing_units > 1,
	});

	let priceStr2 = "";
	if (item.billing_units && item.billing_units > 1) {
		priceStr2 = `${numberWithCommas(item.billing_units)} ${billingFeatureName}`;
	} else {
		priceStr2 = `${billingFeatureName}`;
	}

	const intervalStr =
		isMainPrice && item.interval ? ` per ${item.interval}` : "";

	if (includedUsageStr) {
		return {
			primaryText: includedUsageStr,
			secondaryText: `then ${priceStr} per ${priceStr2}${intervalStr}`,
		};
	}

	return {
		primaryText: priceStr,
		secondaryText: `per ${priceStr2}${intervalStr}`,
	};
};

export const getAttachScenario = ({
	curMainProduct,
	curScheduledProduct,
	fullProduct,
}: {
	curMainProduct?: FullCusProduct | null;
	curScheduledProduct?: FullCusProduct | null;
	fullProduct: FullProduct;
}) => {
	if (!curMainProduct) return AttachScenario.New;

	if (fullProduct.is_add_on) {
		return AttachScenario.New;
	}

	// 1. If current product is the same as the product, return active
	if (curMainProduct?.product.id == fullProduct.id) {
		if (curMainProduct.canceled_at != null) {
			return AttachScenario.Renew;
		} else return AttachScenario.Active;
	}

	if (curScheduledProduct?.product.id == fullProduct.id) {
		return AttachScenario.Scheduled;
	}

	const curFullProduct = cusProductToProduct({ cusProduct: curMainProduct });

	const isUpgrade = isProductUpgrade({
		prices1: curFullProduct.prices,
		prices2: fullProduct.prices,
	});

	return isUpgrade ? AttachScenario.Upgrade : AttachScenario.Downgrade;
};

export const toPricecnProduct = async ({
	db,
	org,
	product,
	fullProduct,
	otherProducts,
	features,
	curMainProduct,
	curScheduledProduct,
	fullCus,
}: {
	db: DrizzleCli;
	org: Organization;
	product: ProductV2;
	fullProduct: FullProduct;
	otherProducts: FullProduct[];
	features: Feature[];
	curMainProduct?: FullCusProduct | null;
	curScheduledProduct?: FullCusProduct | null;
	fullCus?: FullCustomer;
}) => {
	const items = structuredClone(product.items);

	sortProductItems(items, features);

	const price = getPricecnPrice({ org, items, features });
	const priceExists = items.some(
		(i) => isPriceItem(i) || isFeaturePriceItem(i),
	);
	const itemsWithoutPrice = priceExists ? items.slice(1) : items;

	const pricecnItems = itemsWithoutPrice.map((i) => {
		let data: {
			primaryText?: string;
			secondaryText?: string;
		};

		if (isPriceItem(i)) {
			const priceTxt = getPriceText({ item: i, org });
			data = {
				primaryText: priceTxt,
				secondaryText: i.interval ? `per ${i.interval}` : undefined,
			};
		}

		const feature = features.find((f) => f.id == i.feature_id);
		if (isFeaturePriceItem(i)) {
			data = featurePricetoPricecnItem({
				feature,
				item: i,
				org,
				withNameAfterIncluded: true,
			});
		} else {
			data = featureToPricecnItem({ feature, item: i });
		}

		return {
			...i,

			primary_text: data?.primaryText,
			secondary_text: data?.secondaryText,

			// To deprecate
			...data,
		};
	});

	const isCurrent = curMainProduct?.product.id == product.id;
	const isScheduled = curScheduledProduct?.product.id == product.id;

	let buttonText = "Get Started";

	if (isCurrent) {
		const isCanceled = curMainProduct!.canceled_at != null;
		buttonText = isCanceled ? "Renew" : "Current Plan";
	} else if (isScheduled) {
		buttonText = "Scheduled";
	}

	const scenario = getAttachScenario({
		curMainProduct,
		curScheduledProduct,
		fullProduct,
	});

	const freeTrial = fullProduct.free_trial;

	let baseVariant = null;
	if (fullProduct.base_variant_id) {
		baseVariant = otherProducts.find(
			(p) => p.id == fullProduct.base_variant_id,
		);
	}

	let name = product.name;
	if (baseVariant) {
		name = `${baseVariant.name}`;
	}

	let intervalGroup = null;
	if (
		baseVariant ||
		otherProducts.some((p) => p.base_variant_id == product.id)
	) {
		const intervalSet = getLargestInterval({ prices: fullProduct.prices });
		intervalGroup = intervalSet?.interval;
	}

	let trialAvailable = false;
	if (product.free_trial && fullCus) {
		let trial = await getFreeTrialAfterFingerprint({
			db,
			freeTrial: product.free_trial,
			fingerprint: fullCus.fingerprint,
			internalCustomerId: fullCus.internal_id,
			internalEntityId: fullCus.entity?.internal_id,
			multipleAllowed: org.config.multiple_trials,
			productId: product.id,
		});

		if (scenario == AttachScenario.Downgrade) trial = null;
		trialAvailable = notNullish(trial) ? true : false;
	}

	return {
		id: product.id,
		name,
		is_add_on: product.is_add_on,
		price: price
			? {
					primary_text: price.primaryText,
					secondary_text: price.secondaryText,

					// To deprecate
					...price,
				}
			: null,
		items: pricecnItems,
		scenario,

		buttonText,
	};
};
