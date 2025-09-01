import { createContext, useContext } from "react";

export const HomeContext = createContext<any>(null);

export const useHomeContext = () => {
	const context = useContext(HomeContext);

	if (context === undefined) {
		throw new Error("useHomeContext must be used within a HomeContextProvider");
	}

	return context;
};
