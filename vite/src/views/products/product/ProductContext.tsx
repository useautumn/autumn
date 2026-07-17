import { createContext, useContext } from "react";
import type { ProductDataCatalogLicense } from "./productDataTypes";

interface ProductContextType {
	setShowNewVersionDialog: (show: boolean) => void;
	refetch?: () => Promise<void>;
	catalogLicenses: ProductDataCatalogLicense[];
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

export const useOptionalProductContext = () => useContext(ProductContext);
