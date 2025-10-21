import {
	ErrCode,
	type Feature,
	type FullProduct,
	OnDecrease,
	OnIncrease,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";
import {
	findSimilarItem,
	itemsAreSame,
} from "@shared/utils/productV2Utils/compareProductUtils.ts/compareItemUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { freeTrialsAreSame } from "../free-trials/freeTrialUtils.js";
import {
	isFeaturePriceItem,
	isPriceItem,
} from "../product-items/productItemUtils/getItemType.js";
import { getResetUsage } from "../product-items/productItemUtils/itemToPriceAndEnt.js";
import { itemToPriceOrTiers } from "../product-items/productItemUtils.js";
import { mapToProductItems } from "../productV2Utils.js";

const sanitizeItems = ({
	items,
	features,
}: {
	items: ProductItem[];
	features: Feature[];
}) => {
	return items.map((item) => {
		const priceData = itemToPriceOrTiers({ item });
		const newItem = {
			...item,
			reset_usage_when_enabled: getResetUsage({
				item,
				feature: features.find((f) => f.id === item.feature_id),
			}),
			...priceData,
		};

		if (!newItem.config) {
			newItem.config = {
				on_increase: OnIncrease.ProrateImmediately,
				on_decrease: OnDecrease.ProrateImmediately,
			};
		}

		return newItem;
	});
};
export const productsAreSame = ({
	newProductV1,
	newProductV2,
	curProductV1,
	curProductV2,
	features,
}: {
	newProductV1?: FullProduct;
	newProductV2?: ProductV2;
	curProductV1?: FullProduct;
	curProductV2?: ProductV2;
	features: Feature[];
}) => {
	if (!newProductV1 && !newProductV2) {
		throw new RecaseError({
			message: "productsAreSame error: product1 not provided",
			code: ErrCode.InvalidRequest,
		});
	}

	if (!curProductV1 && !curProductV2) {
		throw new RecaseError({
			message: "productsAreSame error: product2 not provided",
			code: ErrCode.InvalidRequest,
		});
	}

	let items1 =
		newProductV2?.items ||
		mapToProductItems({
			prices: newProductV1?.prices || [],
			entitlements: newProductV1?.entitlements || [],
			features,
		});

	let items2 =
		curProductV2?.items ||
		mapToProductItems({
			prices: curProductV1?.prices || [],
			entitlements: curProductV1?.entitlements || [],
			features,
		});

	items1 = sanitizeItems({ items: items1, features });
	items2 = sanitizeItems({ items: items2, features });

	let itemsSame = true;
	let pricesChanged = false;
	const newItems: ProductItem[] = [];
	const removedItems: ProductItem[] = [];

	if (items1.length !== items2.length) {
		itemsSame = false;
	}

	// Check if any feature's usage limits have changed
	items1.some((item1) => {
		const matchingItem2 = items2?.find(
			(item2) => item2.feature_id === item1.feature_id,
		);
		if (!matchingItem2) return false;

		const feature = features.find((f) => f.id === item1.feature_id);
		if (!feature) return false;

		return false;
	});

	if (items1.length !== items2.length) {
		itemsSame = false;
	}

	for (const item of items1) {
		const similarItem = findSimilarItem({
			item,
			items: items2,
		});

		if (!similarItem) {
			if (isFeaturePriceItem(item) || isPriceItem(item)) {
				pricesChanged = true;
			}

			itemsSame = false;
			newItems.push(item);

			continue;
		}

		const { same, pricesChanged: pricesChanged_ } = itemsAreSame({
			item1: item,
			item2: similarItem!,
			features,
			logDifferences: false,
		});

		if (!same) {
			itemsSame = false;
			newItems.push(item);
		}

		if (pricesChanged_) {
			pricesChanged = true;
		}
	}

	for (const item of items2) {
		const similarItem = findSimilarItem({
			item,
			items: items1,
		});

		if (!similarItem) {
			itemsSame = false;
			if (isFeaturePriceItem(item) || isPriceItem(item)) {
				pricesChanged = true;
			}

			removedItems.push(item);
		}
	}

	// Compare free trial
	const freeTrial1 = curProductV1?.free_trial || curProductV2?.free_trial;
	const freeTrial2 = newProductV1?.free_trial || newProductV2?.free_trial;

	const freeTrialsSame = freeTrialsAreSame({
		ft1: freeTrial1,
		ft2: freeTrial2,
	});

	if (!freeTrialsSame) {
		console.log("Free trials different");
		console.log("Free trial 1:", freeTrial1);
		console.log("Free trial 2:", freeTrial2);
		console.log("--------------------------------");
	}

	// Compare name
	return {
		itemsSame,
		freeTrialsSame,
		onlyEntsChanged: !pricesChanged,
		newItems,
		removedItems,
	};
};
