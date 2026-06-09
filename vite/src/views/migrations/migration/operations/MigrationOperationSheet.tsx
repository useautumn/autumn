import type { FrontendProduct, ProductItem } from "@autumn/shared";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import {
	ProductProvider,
	useCurrentItem,
	useSetCurrentItem,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { Sheet, SheetContent } from "@/components/v2/sheets/Sheet";
import { disabledItemDraftController } from "@/hooks/inline-editor/useItemDraftController";
import { getItemId } from "@/utils/product/productItemUtils";
import { EditPlanPriceSheet } from "@/views/products/plan/components/EditPlanPriceSheet";
import { EditPlanFeatureSheet } from "@/views/products/plan/components/edit-plan-feature/EditPlanFeatureSheet";
import { SelectFeatureSheet } from "@/views/products/plan/components/SelectFeatureSheet";
import { ProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export type OperationSheetMode = "add-feature" | "edit-feature" | "edit-price";

const EMPTY_PRODUCT: FrontendProduct = {
	id: "__migration_temp__",
	name: "Migration",
	internal_id: "__migration_temp__",
	org_id: "",
	version: 1,
	items: [],
	free_trial: null,
	planType: null,
	basePriceType: null,
} as unknown as FrontendProduct;

const MODE_TO_SHEET: Record<OperationSheetMode, string> = {
	"add-feature": "select-feature",
	"edit-feature": "edit-feature",
	"edit-price": "edit-plan-price",
};

interface MigrationOperationSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: OperationSheetMode;
	initialProduct?: Partial<FrontendProduct>;
	editItem?: ProductItem;
	onSave: (product: FrontendProduct) => void;
}

export function MigrationOperationSheet({
	open,
	onOpenChange,
	mode,
	initialProduct,
	editItem,
	onSave,
}: MigrationOperationSheetProps) {
	const [key, setKey] = useState(0);

	return (
		<Sheet
			open={open}
			onOpenChange={(isOpen) => {
				if (isOpen) setKey((k) => k + 1);
				onOpenChange(isOpen);
			}}
		>
			<SheetContent side="right" hideCloseButton>
				{open && (
					<MigrationOperationSheetContent
						key={key}
						mode={mode}
						initialProduct={initialProduct}
						editItem={editItem}
						onSave={(product) => {
							onSave(product);
							onOpenChange(false);
						}}
						onCancel={() => onOpenChange(false)}
					/>
				)}
			</SheetContent>
		</Sheet>
	);
}

function MigrationOperationSheetContent({
	mode,
	initialProduct,
	editItem,
	onSave,
	onCancel,
}: {
	mode: OperationSheetMode;
	initialProduct?: Partial<FrontendProduct>;
	editItem?: ProductItem;
	onSave: (product: FrontendProduct) => void;
	onCancel: () => void;
}) {
	const buildInit = (): FrontendProduct => {
		const base = { ...EMPTY_PRODUCT, ...initialProduct };
		if (mode === "edit-feature" && editItem) {
			return { ...base, items: [editItem, ...(base.items ?? [])] };
		}
		return base;
	};

	const [product, setProductState] = useState<FrontendProduct>(buildInit);
	const latestProduct = useRef<FrontendProduct>(product);

	const wrappedSetProduct = (
		p: FrontendProduct | ((prev: FrontendProduct) => FrontendProduct),
	) => {
		if (typeof p === "function") {
			setProductState((prev) => {
				const next = p(prev);
				latestProduct.current = next;
				return next;
			});
		} else {
			latestProduct.current = p;
			setProductState(p);
		}
	};

	const [sheetType, setSheetType] = useState<string>(MODE_TO_SHEET[mode]);
	const editItemId = useMemo(
		() =>
			mode === "edit-feature" && editItem
				? getItemId({ item: editItem, itemIndex: 0 })
				: null,
		[mode, editItem],
	);
	const [itemId, setItemId] = useState<string | null>(editItemId);
	const [initialItem, setInitialItem] = useState<ProductItem | null>(
		editItem ? structuredClone(editItem) : null,
	);

	const handleSetSheet = useCallback(
		({ type, itemId: id }: { type: string | null; itemId?: string | null }) => {
			if (type) setSheetType(type);
			setItemId(id ?? null);

			if (type === "edit-feature" && id) {
				const items = latestProduct.current.items ?? [];
				const match = items.find(
					(item, i) => getItemId({ item, itemIndex: i }) === id,
				);
				if (match) setInitialItem(structuredClone(match));
			}
		},
		[],
	);

	const handleApply = () => {
		onSave(latestProduct.current);
	};

	return (
		<ProductProvider
			product={product}
			setProduct={wrappedSetProduct}
			sheetType={sheetType}
			itemId={itemId}
			initialItem={initialItem}
			setSheet={handleSetSheet}
			setInitialItem={setInitialItem}
			updateItemId={setItemId}
			closeSheet={handleApply}
			itemDraft={disabledItemDraftController}
		>
			<MigrationSheetInner
				sheetType={sheetType}
				isUpdate={!!editItem}
				onApply={handleApply}
				onCancel={onCancel}
			/>
		</ProductProvider>
	);
}

function MigrationSheetInner({
	sheetType,
	isUpdate,
	onApply,
	onCancel,
}: {
	sheetType: string;
	isUpdate: boolean;
	onApply: () => void;
	onCancel: () => void;
}) {
	const currentItem = useCurrentItem();
	const setCurrentItem = useSetCurrentItem();

	const handleFeatureCommit = async () => {
		onApply();
		return null;
	};

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 overflow-y-auto">
				{sheetType === "select-feature" && <SelectFeatureSheet />}
				{sheetType === "edit-plan-price" && <EditPlanPriceSheet />}
				{sheetType === "edit-feature" && currentItem && (
					<ProductItemContext.Provider
						value={{
							item: currentItem,
							setItem: setCurrentItem,
							selectedIndex: 0,
							showCreateFeature: false,
							setShowCreateFeature: () => {},
							isUpdate,
							handleUpdateProductItem: handleFeatureCommit,
						}}
					>
						<EditPlanFeatureSheet />
					</ProductItemContext.Provider>
				)}
			</div>
			{sheetType === "edit-plan-price" && (
				<div className="shrink-0 p-4 border-t border-border/40 flex gap-2">
					<Button variant="secondary" onClick={onCancel} className="flex-1">
						Cancel
					</Button>
					<Button variant="primary" onClick={onApply} className="flex-1">
						Apply
					</Button>
				</div>
			)}
		</div>
	);
}
