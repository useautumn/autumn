import { createContext, useContext } from "react";

export const AnalyticsContext = createContext<any>(null);

export const useAnalyticsContext = () => {
	const context = useContext(AnalyticsContext);

	if (context === undefined) {
		throw new Error(
			"useAnalyticsContext must be used within an AnalyticsContextProvider",
		);
	}

	return context;
};
