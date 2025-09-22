import { createContext, useContext } from "react";

export const AddProductContext = createContext<any>(null);

export const useAddProductContext = () => {
	const context = useContext(AddProductContext);

	if (context === undefined) {
		throw new Error(
			"useAddProductContext must be used within a AddProductContextProvider",
		);
	}

	return context;
};
