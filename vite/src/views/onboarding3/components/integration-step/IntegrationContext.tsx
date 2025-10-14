import { createContext, type ReactNode, useContext, useState } from "react";

export type FrontendStackType = "nextjs" | "rr7" | "vite" | "general";
export type BackendStackType =
	| "nextjs"
	| "express"
	| "hono"
	| "elysia"
	| "rr7"
	| "general";
export type AuthType = "betterauth" | "supabase" | "clerk" | "other";
export type CustomerType = "user" | "org";

export interface IntegrationContextType {
	selectedFrontend: FrontendStackType;
	setSelectedFrontend: (stack: FrontendStackType) => void;
	selectedBackend: BackendStackType;
	setSelectedBackend: (stack: BackendStackType) => void;
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
	const [selectedFrontend, setSelectedFrontend] =
		useState<FrontendStackType>("nextjs");
	const [selectedBackend, setSelectedBackend] =
		useState<BackendStackType>("nextjs");
	const [selectedAuth, setSelectedAuth] = useState<AuthType>("betterauth");
	const [customerType, setCustomerType] = useState<CustomerType>("user");
	const [secretKey, setSecretKey] = useState("");

	return (
		<IntegrationContext.Provider
			value={{
				selectedFrontend,
				setSelectedFrontend,
				selectedBackend,
				setSelectedBackend,
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
