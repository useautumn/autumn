import { createContext, useContext } from "react";

export const AnalyticsContext = createContext<any>(null);

export const useAnalyticsContext = () => {
	const context = useContext(AnalyticsContext);

	if (context === undefined) {
		throw new Error(
			"useCustomersContext must be used within a CustomersContextProvider",
		);
	}

	return context;
};
