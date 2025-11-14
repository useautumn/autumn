import {
	type ProductV2,
	productsAreSame,
	productV2ToBasePrice,
} from "@autumn/shared";
import { useMemo } from "react";
import { create } from "zustand";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { DEFAULT_PRODUCT } from "@/views/products/plan/utils/defaultProduct";

interface ProductState {
	// The product being edited (working copy)
	product: ProductV2;

	// The base/original product (for comparison)
	baseProduct: ProductV2 | null;

	// Actions
	setProduct: (product: ProductV2 | ((prev: ProductV2) => ProductV2)) => void;
	setBaseProduct: (product: ProductV2 | null) => void;
	reset: () => void;
}

const initialState = {
	product: DEFAULT_PRODUCT,
	baseProduct: null as ProductV2 | null,
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

// Custom hooks for computed values
export const useHasChanges = () => {
	const product = useProductStore((s) => s.product);
	const baseProduct = useProductStore((s) => s.baseProduct);
	const { features = [] } = useFeaturesQuery();

	return useMemo(() => {
		if (!baseProduct) return false;

		const comparison = productsAreSame({
			newProductV2: product as unknown as ProductV2,
			curProductV2: baseProduct as unknown as ProductV2,
			features,
		});

		return (
			!comparison.itemsSame ||
			!comparison.detailsSame ||
			!comparison.freeTrialsSame
		);
	}, [product, baseProduct, features]);
};

export const useWillVersion = () => {
	const product = useProductStore((s) => s.product);
	const baseProduct = useProductStore((s) => s.baseProduct);
	const { features = [] } = useFeaturesQuery();

	return useMemo(() => {
		if (!baseProduct) return false;

		const comparison = productsAreSame({
			newProductV2: product as unknown as ProductV2,
			curProductV2: baseProduct as unknown as ProductV2,
			features,
		});

		return (
			!comparison.optionsSame ||
			!comparison.itemsSame ||
			!comparison.freeTrialsSame
		);
	}, [product, baseProduct, features]);
};

export const useHasDetailsChanged = () => {
	const product = useProductStore((s) => s.product);
	const baseProduct = useProductStore((s) => s.baseProduct);
	const { features = [] } = useFeaturesQuery();

	return useMemo(() => {
		if (!baseProduct) return false;

		const comparison = productsAreSame({
			newProductV2: product as unknown as ProductV2,
			curProductV2: baseProduct as unknown as ProductV2,
			features,
		});

		const basePrice1 = productV2ToBasePrice({
			product: product as unknown as ProductV2,
		});
		const basePrice2 = productV2ToBasePrice({
			product: baseProduct as unknown as ProductV2,
		});

		const basePricesSame =
			basePrice1?.price === basePrice2?.price &&
			basePrice1?.interval === basePrice2?.interval &&
			basePrice1?.interval_count === basePrice2?.interval_count;

		return !(comparison.detailsSame && basePricesSame);
	}, [product, baseProduct, features]);
};
