import {
	type FrontendProduct,
	getProductItemDisplay,
	itemsAreSame,
	type ProductItem,
	type ProductV2,
	productsAreSame,
	productV2ToBasePrice,
	productV2ToFeatureItems,
} from "@autumn/shared";
import { useMemo } from "react";
import { useParams } from "react-router";
import { create } from "zustand";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { getItemId, getPrepaidItems } from "@/utils/product/productItemUtils";
import { itemToFeature } from "@/utils/product/productItemUtils/convertItem";
import { getVersionCounts } from "@/utils/productUtils";
import { DEFAULT_PRODUCT } from "@/views/products/plan/utils/defaultProduct";
import { useSheetStore } from "./useSheetStore";

interface ProductState {
	// The product being edited (working copy)
	product: FrontendProduct;

	// The base/original product (for comparison)
	baseProduct: FrontendProduct | null;

	// Actions
	setProduct: (
		product: FrontendProduct | ((prev: FrontendProduct) => FrontendProduct),
	) => void;
	setBaseProduct: (product: FrontendProduct | null) => void;
	reset: () => void;
}

const initialState = {
	product: DEFAULT_PRODUCT,
	baseProduct: null as FrontendProduct | null,
};

export const useProductStore = create<ProductState>((set) => ({
	...initialState,

	setProduct: (product) => {
		if (typeof product === "function") {
			// Handle updater function pattern: setProduct(prev => newProduct)
			set((state) => ({ product: product(state.product) }));
		} else {
			// Handle direct value: setProduct(newProduct)
			set({ product });
		}
	},

	setBaseProduct: (baseProduct) => set({ baseProduct }),

	reset: () => set(initialState),
}));

// Custom hook to determine if we're in customer product view based on URL
export const useIsCusPlanEditor = () => {
	const { customer_id } = useParams();
	return !!customer_id;
};

// Custom hooks for computed values
export const useHasChanges = () => {
	const product = useProductStore((s) => s.product);
	const baseProduct = useProductStore((s) => s.baseProduct);
	const { features = [] } = useFeaturesQuery();

	return useMemo(() => {
		if (!baseProduct) return false;

		const comparison = productsAreSame({
			newProductV2: product as unknown as FrontendProduct,
			curProductV2: baseProduct as unknown as FrontendProduct,
			features,
		});

		return (
			!comparison.itemsSame ||
			!comparison.detailsSame ||
			!comparison.freeTrialsSame
		);
	}, [product, baseProduct, features]);
};

export const useHasBillingChanges = ({
	baseProduct,
	newProduct,
}: {
	baseProduct: FrontendProduct;
	newProduct: FrontendProduct;
}) => {
	const { features = [] } = useFeaturesQuery();

	return useMemo(() => {
		if (!baseProduct || !newProduct) return false;

		const comparison = productsAreSame({
			newProductV2: newProduct as unknown as FrontendProduct,
			curProductV2: baseProduct as unknown as FrontendProduct,
			features,
		});

		const hasBillingChanges =
			!comparison.onlyEntsChanged || !comparison.freeTrialsSame;

		return hasBillingChanges;
	}, [baseProduct, newProduct, features]);
};

export const useWillVersion = () => {
	const product = useProductStore((s) => s.product);
	const baseProduct = useProductStore((s) => s.baseProduct);
	const { features = [] } = useFeaturesQuery();

	return useMemo(() => {
		if (!baseProduct) return false;

		const comparison = productsAreSame({
			newProductV2: product as unknown as FrontendProduct,
			curProductV2: baseProduct as unknown as FrontendProduct,
			features,
		});

		return (
			!comparison.optionsSame ||
			!comparison.itemsSame ||
			!comparison.freeTrialsSame
		);
	}, [product, baseProduct, features]);
};

const useHasDetailsChanged = () => {
	const product = useProductStore((s) => s.product);
	const baseProduct = useProductStore((s) => s.baseProduct);
	const { features = [] } = useFeaturesQuery();

	return useMemo(() => {
		if (!baseProduct) return false;

		const comparison = productsAreSame({
			newProductV2: product as unknown as FrontendProduct,
			curProductV2: baseProduct as unknown as FrontendProduct,
			features,
		});

		const basePrice1 = productV2ToBasePrice({
			product: product as unknown as FrontendProduct,
		});
		const basePrice2 = productV2ToBasePrice({
			product: baseProduct as unknown as FrontendProduct,
		});

		const basePricesSame =
			basePrice1?.price === basePrice2?.price &&
			basePrice1?.interval === basePrice2?.interval &&
			basePrice1?.interval_count === basePrice2?.interval_count;

		return !(comparison.detailsSame && basePricesSame);
	}, [product, baseProduct, features]);
};

const useCurrentItem = () => {
	const product = useProductStore((s) => s.product);
	const itemId = useSheetStore((s) => s.itemId);

	return useMemo(() => {
		if (!itemId || !product?.items) return null;

		const featureItems = productV2ToFeatureItems({ items: product.items });

		// Find the item by comparing itemIds using the original items array indices
		for (let i = 0; i < product.items.length; i++) {
			const item = product.items[i];
			if (!item) continue;

			// Check if this item is in the featureItems array
			const isFeatureItem = featureItems.some((fi) => fi === item);
			if (!isFeatureItem) continue;

			const currentItemId = getItemId({ item, itemIndex: i });
			if (currentItemId === itemId) {
				return item;
			}
		}

		return null;
	}, [product, itemId]);
};

/**
 * Hook to check if the current item has unsaved changes compared to its initial state
 */
const useHasItemChanges = () => {
	const item = useCurrentItem();
	const initialItem = useSheetStore((s) => s.initialItem);
	const { features = [] } = useFeaturesQuery();

	return useMemo(() => {
		if (!item || !initialItem) return false;

		const { same } = itemsAreSame({
			item1: item,
			item2: initialItem,
			features,
		});

		return !same;
	}, [item, initialItem, features]);
};

/**
 * Hook to discard item changes (restore to initial state) and close the sheet
 */
export const useDiscardItemAndClose = () => {
	const setCurrentItem = useSetCurrentItem();
	const initialItem = useSheetStore((s) => s.initialItem);
	const closeSheet = useSheetStore((s) => s.closeSheet);

	return () => {
		if (initialItem) {
			setCurrentItem(initialItem);
		}
		closeSheet();
	};
};

const useSetCurrentItem = () => {
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);
	const itemId = useSheetStore((s) => s.itemId);

	return (updatedItem: ProductItem) => {
		if (!product || !product.items || !itemId) return;

		// Find the index in the original items array
		let originalIndex = -1;
		for (let i = 0; i < product.items.length; i++) {
			const item = product.items[i];
			if (!item) continue;

			const currentItemId = getItemId({ item, itemIndex: i });
			if (currentItemId === itemId) {
				originalIndex = i;
				break;
			}
		}

		if (originalIndex === -1) return;

		// Update the item in the original items array
		const updatedItems = [...product.items];
		updatedItems[originalIndex] = updatedItem;
		setProduct({ ...product, items: updatedItems });
	};
};

/**
 * Hook to check if the current product is the latest version.
 */
export const useIsLatestVersion = (product: FrontendProduct) => {
	const { products = [] } = useProductsQuery();

	return useMemo(() => {
		if (!product?.id) return true;

		const versionCounts = getVersionCounts(products);
		const latestVersion = versionCounts[product.id];

		return !latestVersion || product.version === latestVersion;
	}, [product, products]);
};

export interface PrepaidItemWithFeature extends ProductItem {
	feature: ReturnType<typeof itemToFeature>;
	display: ReturnType<typeof getProductItemDisplay>;
}

/**
 * Hook to get prepaid items from a product with feature information and display
 */
export const usePrepaidItems = ({
	product,
}: {
	product?: ProductV2 | FrontendProduct;
}) => {
	const { features, ...rest } = useFeaturesQuery();

	return useMemo(() => {
		if (!product) return { prepaidItems: [], ...rest };

		const prepaidItems = getPrepaidItems(product);

		const prepaidItemsWithFeatures = prepaidItems.map((item) => {
			const feature = itemToFeature({ item, features });
			const display = getProductItemDisplay({
				item,
				features,
				currency: "usd",
			});

			return {
				...item,
				feature,
				display,
			};
		});
		return {
			prepaidItems: prepaidItemsWithFeatures,
			...rest,
		};
	}, [product, features, rest]);
};
