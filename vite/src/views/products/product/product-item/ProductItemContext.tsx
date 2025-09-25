import type { ProductItem } from "@autumn/shared";
import { createContext, useContext } from "react";

export interface ProductItemContextType {
	item: ProductItem;
	setItem: (item: ProductItem) => void;
}

export const ProductItemContext = createContext<ProductItemContextType>({
	item: {},
	setItem: () => {},
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
