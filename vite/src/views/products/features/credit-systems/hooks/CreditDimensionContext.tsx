import type { CreditSchemaItem } from "@autumn/shared";
import { createContext, type ReactNode, useContext } from "react";
import {
	type CreditDimensionEditor,
	useCreditDimensionEditor,
} from "./useCreditDimensionEditor";

const CreditDimensionContext = createContext<CreditDimensionEditor | null>(
	null,
);

/** The three tables all edit one rate-card row, so they share one editor. */
export function CreditDimensionProvider({
	item,
	onChange,
	children,
}: {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
	children: ReactNode;
}) {
	const editor = useCreditDimensionEditor({ item, onChange });

	return (
		<CreditDimensionContext.Provider value={editor}>
			{children}
		</CreditDimensionContext.Provider>
	);
}

export function useCreditDimensions(): CreditDimensionEditor {
	const editor = useContext(CreditDimensionContext);
	if (!editor) {
		throw new Error(
			"useCreditDimensions must be used inside a CreditDimensionProvider",
		);
	}
	return editor;
}
