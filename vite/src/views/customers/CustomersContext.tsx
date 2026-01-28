import { createContext, useContext } from "react";

export const CustomersContext = createContext<any>(null);

const useCustomersContext = () => {
	const context = useContext(CustomersContext);

	if (context === undefined) {
		throw new Error(
			"useCustomersContext must be used within a CustomersContextProvider",
		);
	}

	return context;
};
