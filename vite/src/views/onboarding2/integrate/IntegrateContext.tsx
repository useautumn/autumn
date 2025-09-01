import { createContext, useContext } from "react";

export const IntegrateContext = createContext<any>(null);

export const useIntegrateContext = () => {
	const context = useContext(IntegrateContext);

	if (context === undefined) {
		throw new Error(
			"useProductContext must be used within a ProductContextProvider",
		);
	}

	return context;
};
