import type { FrontendProduct, ProductItem } from "@autumn/shared";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

type SheetType =
	| "edit-plan"
	| "edit-plan-price"
	| "edit-feature"
	| "new-feature"
	| "select-feature"
	| null;

interface InlineEditorContextValue {
	// Product state
	product: FrontendProduct;
	setProduct: (product: FrontendProduct) => void;
	// Sheet state
	sheetType: SheetType;
	previousSheetType: SheetType;
	itemId: string | null;
	initialItem: ProductItem | null;
	setSheet: (params: { type: SheetType; itemId?: string | null }) => void;
	setInitialItem: (item: ProductItem | null) => void;
	closeSheet: () => void;
}

const InlineEditorContext = createContext<InlineEditorContextValue | null>(
	null,
);

interface InlineEditorProviderProps {
	children: ReactNode;
	initialProduct: FrontendProduct;
}

export function InlineEditorProvider({
	children,
	initialProduct,
}: InlineEditorProviderProps) {
	// Product state
	const [product, setProduct] = useState<FrontendProduct>(initialProduct);

	// Sheet state
	const [sheetType, setSheetType] = useState<SheetType>(null);
	const [previousSheetType, setPreviousSheetType] = useState<SheetType>(null);
	const [itemId, setItemId] = useState<string | null>(null);
	const [initialItem, setInitialItemState] = useState<ProductItem | null>(null);

	const setSheet = useCallback(
		({ type, itemId = null }: { type: SheetType; itemId?: string | null }) => {
			setPreviousSheetType(sheetType);
			setSheetType(type);
			setItemId(itemId);
			setInitialItemState(null);
		},
		[sheetType],
	);

	const setInitialItem = useCallback((item: ProductItem | null) => {
		setInitialItemState(item);
	}, []);

	const closeSheet = useCallback(() => {
		setPreviousSheetType(sheetType);
		setSheetType(null);
		setItemId(null);
		setInitialItemState(null);
	}, [sheetType]);

	const value = useMemo(
		(): InlineEditorContextValue => ({
			product,
			setProduct,
			sheetType,
			previousSheetType,
			itemId,
			initialItem,
			setSheet,
			setInitialItem,
			closeSheet,
		}),
		[
			product,
			sheetType,
			previousSheetType,
			itemId,
			initialItem,
			setSheet,
			setInitialItem,
			closeSheet,
		],
	);

	return (
		<InlineEditorContext.Provider value={value}>
			{children}
		</InlineEditorContext.Provider>
	);
}

export function useInlineEditorContext() {
	const context = useContext(InlineEditorContext);
	if (!context)
		throw new Error(
			"useInlineEditorContext must be used within InlineEditorProvider",
		);
	return context;
}
