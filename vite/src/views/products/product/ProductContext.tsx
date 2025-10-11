import { createContext, useContext } from "react";

interface ProductContextType {
	setShowNewVersionDialog: (show: boolean) => void;
	refetch?: () => Promise<void>;
}

export const ProductContext = createContext<ProductContextType | null>(null);

export const useProductContext = (): ProductContextType => {
	const context = useContext(ProductContext);

	if (context === null || context === undefined) {
		throw new Error(
			"useProductContext must be used within a ProductContextProvider",
		);
	}

	return context;
};
