import type { Feature } from "../../models/featureModels/featureModels.js";
import type { ProductItem } from "../../models/productV2Models/productItemModels/productItemModels.js";
import {
	isFeaturePriceItem,
	isPriceItem,
} from "../productV2Utils/productItemUtils/getItemType.js";

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
		const feature = features.find((f) => f.id === a.feature_id);
		const aFeatureName = feature?.name;
		const bFeatureName = features.find((f) => f.id === b.feature_id)?.name;

		if (!aFeatureName || !bFeatureName) {
			return 0;
		}

		return aFeatureName.localeCompare(bFeatureName);
	});

	return items;
};
