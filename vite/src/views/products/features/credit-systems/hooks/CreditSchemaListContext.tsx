import type { CreditSchemaItem } from "@autumn/shared";
import { createContext, type ReactNode, useContext } from "react";
import { useCreditSchemaList } from "./useCreditSchemaList";

type CreditSchemaListValue = ReturnType<typeof useCreditSchemaList> & {
	schema: CreditSchemaItem[];
};

const CreditSchemaListContext = createContext<CreditSchemaListValue | null>(
	null,
);

/** Owns the rate card's list state so the card, its rows and the dimensions
 * editor read one source rather than threading props. */
export function CreditSchemaListProvider({
	schema,
	onChange,
	onRemoveLast,
	children,
}: {
	schema: CreditSchemaItem[];
	onChange: (schema: CreditSchemaItem[]) => void;
	/** Called instead of onChange when removing the only remaining item. */
	onRemoveLast?: () => void;
	children: ReactNode;
}) {
	const list = useCreditSchemaList({ schema, onChange, onRemoveLast });

	return (
		<CreditSchemaListContext.Provider value={{ ...list, schema }}>
			{children}
		</CreditSchemaListContext.Provider>
	);
}

export const useCreditSchemaListContext = () => {
	const context = useContext(CreditSchemaListContext);
	if (!context) {
		throw new Error(
			"useCreditSchemaListContext must be used within a CreditSchemaListProvider",
		);
	}
	return context;
};
