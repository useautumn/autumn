import type { ProductItem } from "@autumn/shared";
import { createContext, useContext } from "react";

interface ProductItemContextType {
	item: ProductItem | null;
	initialItem?: ProductItem | null;
	setItem: (item: ProductItem) => void;
	selectedIndex: number;
	showCreateFeature: boolean;
	setShowCreateFeature: (show: boolean) => void;
	isUpdate: boolean;
	handleUpdateProductItem: () => Promise<any>;
}

export const ProductItemContext = createContext<ProductItemContextType>({
	item: null,
	initialItem: null,
	setItem: () => {},
	selectedIndex: 0,
	showCreateFeature: false,
	setShowCreateFeature: () => {},
	isUpdate: false,
	handleUpdateProductItem: async () => null,
});

export const useProductItemContext = () => {
	const context = useContext<ProductItemContextType>(ProductItemContext);

	if (context === undefined) {
		throw new Error(
			"useProductItemContext must be used within a ProductItemContextProvider",
		);
	}

	return context;
};
