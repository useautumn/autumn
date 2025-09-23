import type { ProductItem } from "@autumn/shared";
import { useState } from "react";
import { useParams } from "react-router";
import V2Breadcrumb from "@/components/v2/breadcrumb";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useProductChangedAlert } from "../product/hooks/useProductChangedAlert";
import { useProductData } from "../product/hooks/useProductData";
import { useProductQuery } from "../product/hooks/useProductQuery";
import { ProductContext, useProductContext } from "../product/ProductContext";
import { ProductItemContext } from "../product/product-item/ProductItemContext";
import ConfirmNewVersionDialog from "../product/versioning/ConfirmNewVersionDialog";
import { ManagePlan } from "./components/Editor";
import { EditPlanItemSheet } from "./components/EditPlanItemSheet";
import { EditPlanSheet } from "./components/EditPlanSheet";

type Sheets = "edit-plan" | "edit-feature" | null;

export default function PlanEditorView() {
	const { plan_id } = useParams();

	const { product: originalProduct, isLoading, error } = useProductQuery();

	const {
		product,
		setProduct,
		hasChanges,
		entityFeatureIds,
		setEntityFeatureIds,
		actionState,
	} = useProductData({ originalProduct });

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

	if (isLoading) return <LoadingScreen />;
	if (error) {
		return (
			<ErrorScreen returnUrl="/products">
				{error ? error.message : `Plan ${plan_id} not found`}
			</ErrorScreen>
		);
	}

	if (!product) return;

	return (
		<ProductContext.Provider
			value={{
				setShowNewVersionDialog,
				product,
				setProduct,
				actionState,
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
			<div className="flex w-full h-full overflow-hidden">
				<div className="flex flex-col w-full min-h-0">
					<V2Breadcrumb
						items={[
							{
								name: "Plans",
								href: "/products",
							},
							{
								name: "Plan Editor",
								href: `/products`,
							},
						]}
					/>

					<div className="flex flex-1 min-h-0 pt-4 overflow-hidden">
						<div className="flex-1 min-h-0 w-full min-w-sm overflow-hidden">
							<ManagePlan />
						</div>
					</div>
					{/* <div className="flex justify-end gap-2 p-10 w-full lg:hidden">
						<div className="w-fit">
							<UpdateProductButton />
						</div>
					</div> */}
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
		product?.items?.find((item: ProductItem) => {
			const itemId =
				item.entitlement_id ||
				item.price_id ||
				`${item.feature_id}-${item.usage_model}`;
			return editingState.id === itemId;
		}) || null;

	// Don't render on small screens
	const renderSheet = () => {
		switch (sheet) {
			case "edit-plan":
				return (
					<div className="sheet-content">
						<EditPlanSheet />
					</div>
				);
			case "edit-feature":
				return (
					<div className="sheet-content">
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
							<EditPlanItemSheet />
						</ProductItemContext.Provider>
					</div>
				);
			default:
				return null;
		}
	};

	return (
		<div className="flex-col gap-4 h-full border-l py-6 hidden md:flex">
			{renderSheet()}
		</div>
	);
};
