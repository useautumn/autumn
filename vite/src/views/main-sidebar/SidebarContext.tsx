import { createContext, useContext } from "react";

interface SidebarContextType {
	expanded: boolean;
	setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
	onNavigate?: () => void;
}

export const SidebarContext = createContext<SidebarContextType | null>(null);

export const useSidebarContext = () => {
	const context = useContext(SidebarContext);

	if (context === null) {
		throw new Error(
			"useSidebarContext must be used within a SidebarContextProvider",
		);
	}

	return context;
};
