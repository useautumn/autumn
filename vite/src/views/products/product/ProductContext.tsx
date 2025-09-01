import { createContext, useContext } from "react";

export const ProductContext = createContext<any>(null);

export const useProductContext = () => {
	const context = useContext(ProductContext);

	if (context === undefined) {
		throw new Error(
			"useProductContext must be used within a ProductContextProvider",
		);
	}

	return context;
};
