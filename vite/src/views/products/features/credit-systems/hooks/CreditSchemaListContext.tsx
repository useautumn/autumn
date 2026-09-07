import type { CreditSchemaItem } from "@autumn/shared";
import { createContext, type ReactNode, useContext } from "react";
import { useCreditSchemaList } from "./useCreditSchemaList";

type CreditSchemaListValue = ReturnType<typeof useCreditSchemaList> & {
	schema: CreditSchemaItem[];
};

const CreditSchemaListContext = createContext<CreditSchemaListValue | null>(
	null,
);

export function CreditSchemaListProvider({
	schema,
	onChange,
	onRemoveLast,
	children,
}: {
	schema: CreditSchemaItem[];
	onChange: (schema: CreditSchemaItem[]) => void;
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
