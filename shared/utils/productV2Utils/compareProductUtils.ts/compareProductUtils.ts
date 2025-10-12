/** biome-ignore-all lint/suspicious/noDoubleEquals: comparison functions require double equals */
import type { Feature } from "../../../models/featureModels/featureModels.js";
import type { FullProduct } from "../../../models/productModels/productModels.js";
import {
	OnDecrease,
	OnIncrease,
} from "../../../models/productV2Models/productItemModels/productItemEnums.js";
import type { ProductItem } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import type { ProductV2 } from "../../../models/productV2Models/productV2Models.js";
import { freeTrialsAreSame } from "../../productUtils/freeTrialUtils.js";
import { mapToProductItems } from "../mapToProductV2.js";
import {
	isFeaturePriceItem,
	isPriceItem,
} from "../productItemUtils/getItemType.js";
import { itemToPriceOrTiers } from "../productItemUtils/getProductItemRes.js";
import { getResetUsage } from "../productItemUtils/productItemUtils.js";
import { findSimilarItem, itemsAreSame } from "./compareItemUtils.js";

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

export const compareDetails = ({
	newProductV2,
	curProductV2,
}: {
	newProductV2?: ProductV2;
	curProductV2?: ProductV2;
}) => {
	const checks = {
		is_add_on: {
			condition: newProductV2?.is_add_on === curProductV2?.is_add_on,
			message: `Is add-on different: ${newProductV2?.is_add_on} !== ${curProductV2?.is_add_on}`,
		},
		is_default: {
			condition: newProductV2?.is_default === curProductV2?.is_default,
			message: `Is default different: ${newProductV2?.is_default} !== ${curProductV2?.is_default}`,
		},
		archived: {
			condition: newProductV2?.archived === curProductV2?.archived,
			message: `Archived different: ${newProductV2?.archived} !== ${curProductV2?.archived}`,
		},
		group: {
			condition: newProductV2?.group == curProductV2?.group,
			message: `Group different: ${newProductV2?.group} !== ${curProductV2?.group}`,
		},
		name: {
			condition: newProductV2?.name == curProductV2?.name,
			message: `Name different: ${newProductV2?.name} !== ${curProductV2?.name}`,
		},
		id: {
			condition: newProductV2?.id === curProductV2?.id,
			message: `ID different: ${newProductV2?.id} !== ${curProductV2?.id}`,
		},
	};

	const detailsSame = Object.values(checks).every((d) => d.condition);

	if (!detailsSame) {
		console.log(
			"Product details different:",
			Object.values(checks)
				.filter((d) => !d.condition)
				.map((d) => d.message),
		);
	}

	return detailsSame;
};

export const prodOptionsAreSame = ({
	curProduct,
	newProduct,
}: {
	curProduct: ProductV2 | FullProduct;
	newProduct: ProductV2 | FullProduct;
}) => {
	return (
		curProduct.is_default === newProduct.is_default &&
		curProduct.is_add_on === newProduct.is_add_on
	);
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
		throw new Error("productsAreSame error: product1 not provided");
	}

	if (!curProductV1 && !curProductV2) {
		throw new Error("productsAreSame error: product2 not provided");
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
	let detailsSame = true;
	const newItems: ProductItem[] = [];
	const removedItems: ProductItem[] = [];

	detailsSame = compareDetails({
		newProductV2,
		curProductV2,
	});

	if (items1.length !== items2.length) {
		itemsSame = false;
	}

	if (items1.length !== items2.length) itemsSame = false;

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
			item2: similarItem,
			features,
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

	const optionsSame = prodOptionsAreSame({
		// biome-ignore lint/style/noNonNullAssertion: either one is provided
		curProduct: curProductV2 || curProductV1!,
		// biome-ignore lint/style/noNonNullAssertion: either one is provided
		newProduct: newProductV2 || newProductV1!,
	});

	// Compare name
	return {
		itemsSame,
		freeTrialsSame,
		onlyEntsChanged: !pricesChanged,
		newItems,
		removedItems,
		detailsSame,
		optionsSame,
	};
};
