import { createContext, type ReactNode, useContext, useState } from "react";

export type StackType =
	| "nextjs"
	| "express"
	| "hono"
	| "elysia"
	| "remix"
	| "rr7"
	| "general";
export type AuthType = "betterauth" | "supabase" | "clerk" | "other";
export type CustomerType = "user" | "org";

export interface IntegrationContextType {
	selectedStack: StackType;
	setSelectedStack: (stack: StackType) => void;
	selectedAuth: AuthType;
	setSelectedAuth: (auth: AuthType) => void;
	customerType: CustomerType;
	setCustomerType: (type: CustomerType) => void;
	secretKey: string;
	setSecretKey: (key: string) => void;
}

export const IntegrationContext = createContext<IntegrationContextType | null>(
	null,
);

export const useIntegrationContext = () => {
	const context = useContext(IntegrationContext);

	if (!context) {
		throw new Error(
			"useIntegrationContext must be used within an IntegrationProvider",
		);
	}

	return context;
};

export const IntegrationProvider = ({ children }: { children: ReactNode }) => {
	const [selectedStack, setSelectedStack] = useState<StackType>("nextjs");
	const [selectedAuth, setSelectedAuth] = useState<AuthType>("betterauth");
	const [customerType, setCustomerType] = useState<CustomerType>("user");
	const [secretKey, setSecretKey] = useState("");

	return (
		<IntegrationContext.Provider
			value={{
				selectedStack,
				setSelectedStack,
				selectedAuth,
				setSelectedAuth,
				customerType,
				setCustomerType,
				secretKey,
				setSecretKey,
			}}
		>
			{children}
		</IntegrationContext.Provider>
	);
};
