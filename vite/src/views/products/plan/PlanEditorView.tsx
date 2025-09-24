import type { ProductItem } from "@autumn/shared";
import { useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useProductChangedAlert } from "../product/hooks/useProductChangedAlert";
import { useProductQuery } from "../product/hooks/useProductQuery";
import { ProductContext, useProductContext } from "../product/ProductContext";
import { ProductItemContext } from "../product/product-item/ProductItemContext";
import ConfirmNewVersionDialog from "../product/versioning/ConfirmNewVersionDialog";
import { ManagePlan } from "./components/Editor";
import { EditPlanHeader } from "./components/EditPlanHeader";
import { EditPlanFeatureSheet } from "./components/EditPlanItemSheet";
import { EditPlanSheet } from "./components/EditPlanSheet";
import { SaveChangesBar } from "./components/SaveChangesBar";
import { usePlanData } from "./hooks/usePlanData";

type Sheets = "edit-plan" | "edit-feature" | null;

export default function PlanEditorView() {
	const { product: originalProduct } = useProductQuery();
	const { isLoading: featuresLoading } = useFeaturesQuery();

	const { product, setProduct, hasChanges } = usePlanData({ originalProduct });
	const [entityFeatureIds, setEntityFeatureIds] = useState<string[]>([]);

	const { modal } = useProductChangedAlert({ hasChanges });
	const [showNewVersionDialog, setShowNewVersionDialog] = useState(false);
	const [sheet, setSheet] = useState<Sheets>(null);
	const [editingState, setEditingState] = useState<{
		type: "plan" | "feature" | null;
		id: string | null;
	}>({ type: null, id: null });

	const setSheetWithTransition = (newSheet: Sheets) => {
		if (!document.startViewTransition) {
			setSheet(newSheet);
			return;
		}

		document.startViewTransition(() => {
			setSheet(newSheet);
		});
	};

	if (!product || featuresLoading) return <LoadingScreen />;

	return (
		<ProductContext.Provider
			value={{
				setShowNewVersionDialog,
				product,
				setProduct,
				entityFeatureIds,
				setEntityFeatureIds,
				hasChanges,
				setSheet: setSheetWithTransition,
				editingState,
				setEditingState,
			}}
		>
			<ConfirmNewVersionDialog
				open={showNewVersionDialog}
				setOpen={setShowNewVersionDialog}
			/>
			<div className="flex w-full h-full overflow-y-auto bg-[#eee]">
				<div className="flex flex-col justify-between h-full flex-1">
					<EditPlanHeader />
					<ManagePlan />
					<SaveChangesBar />
				</div>

				<PlanSheets sheet={sheet} />
			</div>
			{modal}
		</ProductContext.Provider>
	);
}

export const PlanSheets = ({ sheet }: { sheet: Sheets }) => {
	const { product, editingState } = useProductContext();

	// Find the item being edited
	const currentItem =
		product?.items?.find((item: ProductItem, index: number) => {
			const itemId = item.entitlement_id || item.price_id || `item-${index}`;
			return editingState.id === itemId;
		}) || null;

	// Don't render on small screens
	const renderSheet = () => {
		switch (sheet) {
			case "edit-plan":
				return <EditPlanSheet />;
			case "edit-feature":
				return (
					<ProductItemContext.Provider
						value={{
							item: currentItem,
							setItem: () => {}, // Read-only for now
							selectedIndex: 0,
							showCreateFeature: false,
							setShowCreateFeature: () => {},
							isUpdate: false,
							handleUpdateProductItem: async () => null,
						}}
					>
						<EditPlanFeatureSheet />
					</ProductItemContext.Provider>
				);
			default:
				return <EditPlanSheet />;
		}
	};

	return (
		<div className="w-full max-w-md bg-card z-50 border-l shadow-sm flex flex-col overflow-y-auto h-full">
			{renderSheet()}
		</div>
	);
};
