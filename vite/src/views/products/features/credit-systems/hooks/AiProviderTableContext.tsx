import type { ModelsDevProvider } from "@autumn/shared";
import { createContext, type ReactNode, useContext } from "react";
import type { CreditSystemFormInstance } from "./useCreditSystemForm";

type AiProviderTableValue = {
	form: CreditSystemFormInstance;
	provider: ModelsDevProvider;
	providerKey: string;
	isCustom: boolean;
	isLoading: boolean;
	renameKey: (oldKey: string, newKey: string) => void;
	removeKeys: (keys: string[]) => void;
};

const AiProviderTableContext = createContext<AiProviderTableValue | null>(null);

/** Read by the rate table's cells so the column defs can be constants —
 * closing over props rebuilds them on every keystroke and drops focus. */
export function AiProviderTableProvider({
	value,
	children,
}: {
	value: AiProviderTableValue;
	children: ReactNode;
}) {
	return (
		<AiProviderTableContext.Provider value={value}>
			{children}
		</AiProviderTableContext.Provider>
	);
}

export const useAiProviderTable = () => {
	const context = useContext(AiProviderTableContext);
	if (!context) {
		throw new Error(
			"useAiProviderTable must be used within an AiProviderTableProvider",
		);
	}
	return context;
};
