import type { FullCustomer } from "@autumn/shared";
import { createContext, useContext } from "react";

type CustomerContextType = {
	customer: FullCustomer;
	entityId: string | null;
	setEntityId: (entityId: string | null) => void;
	isInlineEditorOpen: boolean;
	setIsInlineEditorOpen: (isOpen: boolean) => void;
};
export const CustomerContext = createContext<CustomerContextType | null>(null);

export const useCustomerContext = () => {
	const context = useContext(CustomerContext);

	if (!context) {
		throw new Error(
			"useCustomerContext must be used within a CustomerContextProvider",
		);
	}

	return context;
};
