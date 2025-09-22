import { useState } from "react";
import { useParams } from "react-router";
import V2Breadcrumb from "@/components/v2/breadcrumb";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useProductChangedAlert } from "../product/hooks/useProductChangedAlert";
import { useProductData } from "../product/hooks/useProductData";
import { useProductQuery } from "../product/hooks/useProductQuery";
import { ProductContext } from "../product/ProductContext";
import ConfirmNewVersionDialog from "../product/versioning/ConfirmNewVersionDialog";
import { ManagePlan } from "./components/Editor";
import { EditPlanSheet } from "./components/EditPlanSheet";

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

				<EditPlanSheet />
			</div>
			{modal}
		</ProductContext.Provider>
	);
}
