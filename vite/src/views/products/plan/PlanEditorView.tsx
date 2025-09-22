import { useState } from "react";
import { useParams } from "react-router";
import V2Breadcrumb from "@/components/v2/breadcrumb";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { UpdateProductButton } from "../product/components/UpdateProductButton";
import { useProductChangedAlert } from "../product/hooks/useProductChangedAlert";
import { useProductData } from "../product/hooks/useProductData";
import { useProductQuery } from "../product/hooks/useProductQuery";
import { ProductContext } from "../product/ProductContext";
import ProductSidebar from "../product/ProductSidebar";
import ConfirmNewVersionDialog from "../product/versioning/ConfirmNewVersionDialog";
import { ManagePlan } from "./components/Editor";

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
			<div className="flex w-full">
				<div className="flex flex-col gap-4 w-full">
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

					<div className="flex">
						<div className="flex-1 w-full min-w-sm">
							<ManagePlan />
						</div>
					</div>
					<div className="flex justify-end gap-2 p-10 w-full lg:hidden">
						<div className="w-fit">
							<UpdateProductButton />
						</div>
					</div>
				</div>
				<div className="hidden max-w-md w-1/3 shrink-1 lg:block lg:min-w-xs sticky top-0">
					<ProductSidebar />
				</div>
			</div>
			{modal}
		</ProductContext.Provider>
	);
}
