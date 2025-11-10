import type { CustomerWithProducts } from "@autumn/shared";
import { createContext, useContext } from "react";

export type CustomerContextType = {
	customer: CustomerWithProducts;
	entityId: string | null;
	setEntityId: (entityId: string | null) => void;
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
