import { createContext, useContext } from "react";

export const AppContext = createContext<any>(null);

const useAppContext = () => {
	const context = useContext(AppContext);

	if (context === undefined) {
		throw new Error("useDevContext must be used within a DevContextProvider");
	}

	return context;
};
