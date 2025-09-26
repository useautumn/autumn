import { createContext, useContext } from "react";

type Sheets = "edit-plan" | "edit-feature";

interface EditingState {
	type: "plan" | "feature" | null;
	id: string | null;
}

interface ProductContextType {
	setShowNewVersionDialog: (show: boolean) => void;
	product: any;
	setProduct: (product: any) => void;
	entityFeatureIds: string[];
	setEntityFeatureIds: (ids: string[]) => void;
	hasChanges: boolean;
	willVersion: boolean;
	setSheet: (sheet: Sheets) => void;
	editingState: EditingState;
	setEditingState: (state: EditingState) => void;
}

export const ProductContext = createContext<any | null>(null);

export const useProductContext = (): any => {
	const context = useContext(ProductContext);

	if (context === null || context === undefined) {
		throw new Error(
			"useProductContext must be used within a ProductContextProvider",
		);
	}

	return context;
};
