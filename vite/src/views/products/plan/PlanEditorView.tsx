import { type ProductItem, productV2ToFeatureItems } from "@autumn/shared";
import { useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getItemId } from "@/utils/product/productItemUtils";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useProductChangedAlert } from "../product/hooks/useProductChangedAlert";
import { useProductQuery } from "../product/hooks/useProductQuery";
import { ProductContext, useProductContext } from "../product/ProductContext";
import { ProductItemContext } from "../product/product-item/ProductItemContext";
import { EditPlanFeatureSheet } from "./components/EditPlanFeatureSheet/EditPlanFeatureSheet";
import { EditPlanHeader } from "./components/EditPlanHeader";
import { EditPlanSheet } from "./components/EditPlanSheet";
import { ManagePlan } from "./components/ManagePlan";
import { NewFeatureSheet } from "./components/new-feature/NewFeatureSheet";
import { SaveChangesBar } from "./components/SaveChangesBar";
import { usePlanData } from "./hooks/usePlanData";
import ConfirmNewVersionDialog from "./versioning/ConfirmNewVersionDialog";

type Sheets = "edit-plan" | "edit-feature" | "new-feature";

export default function PlanEditorView() {
	const {
		product: originalProduct,
		isLoading: productLoading,
		refetch,
	} = useProductQuery();
	const { isLoading: featuresLoading } = useFeaturesQuery();

	const { product, setProduct, diff } = usePlanData({
		originalProduct,
	});

	const { modal } = useProductChangedAlert({ hasChanges: diff.hasChanges });
	const [showNewVersionDialog, setShowNewVersionDialog] = useState(false);

	const [sheet, setSheet] = useState<Sheets>("edit-plan");
	const [editingState, setEditingState] = useState<{
		type: "plan" | "feature" | null;
		id: string | null;
	}>({ type: "plan", id: null });

	if (!product || featuresLoading || productLoading) return <LoadingScreen />;

	return (
		<ProductContext.Provider
			value={{
				setShowNewVersionDialog,
				product,
				setProduct,
				diff,
				setSheet,
				editingState,
				setEditingState,
				refetch,
			}}
		>
			<ConfirmNewVersionDialog
				open={showNewVersionDialog}
				setOpen={setShowNewVersionDialog}
				onVersionCreated={() => {
					// Reset editing state when new version is created
					setEditingState({ type: null, id: null });
					setSheet("edit-plan");
				}}
			/>
			<div className="flex w-full h-full overflow-y-auto bg-[#eee]">
				<div className="flex flex-col justify-between h-full w-full overflow-x-hidden relative">
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
	const { product, setProduct, editingState } = useProductContext();

	const featureItems = productV2ToFeatureItems({ items: product?.items });

	const isCurrentItem = (item: ProductItem, index: number) => {
		const itemId = getItemId({ item, itemIndex: index });
		return editingState.id === itemId;
	};

	const currentItem = featureItems.find(isCurrentItem);

	const setCurrentItem = (updatedItem: ProductItem) => {
		if (!product || !product.items) return;

		const filteredItems = productV2ToFeatureItems({
			items: product.items,
			withBasePrice: true,
		});

		const currentItemIndex = filteredItems.findIndex(isCurrentItem);

		if (currentItemIndex === -1) return;

		const updatedItems = [...filteredItems];
		updatedItems[currentItemIndex] = updatedItem;
		setProduct({ ...product, items: updatedItems });
	};

	// Don't render on small screens
	const renderSheet = () => {
		switch (sheet) {
			case "edit-plan":
				return <EditPlanSheet />;
			case "edit-feature":
				return (
					<ProductItemContext.Provider
						value={{
							item: currentItem ?? null,
							setItem: setCurrentItem,
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
			case "new-feature":
				return <NewFeatureSheet />;
			default:
				return <EditPlanSheet />;
		}
	};

	return (
		<div className="w-full min-w-xs max-w-md bg-card z-50 border-l shadow-sm flex flex-col overflow-y-auto h-full">
			{renderSheet()}
		</div>
	);
};
