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

/**
 * Per-provider context for the AI rate table's cells.
 *
 * Cells read this instead of closing over props, which lets the column
 * definitions be module-level constants. Closures would force the column array
 * to be rebuilt whenever the form, provider or a handler changed identity —
 * remounting every cell and dropping input focus mid-keystroke.
 */
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
