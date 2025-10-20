"use client";

import { useState } from "react";
import { useParams } from "react-router";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import ProductViewBreadcrumbs from "./components/ProductViewBreadcrumbs";
import { UpdateProductButton } from "./components/UpdateProductButton";
import { useProductChangedAlert } from "./hooks/useProductChangedAlert";
import { useProductData } from "./hooks/useProductData";
import { useProductQuery } from "./hooks/useProductQuery";
import { ManageProduct } from "./ManageProduct";
import { ProductContext } from "./ProductContext";
import ProductSidebar from "./ProductSidebar";
import ConfirmNewVersionDialog from "./versioning/ConfirmNewVersionDialog";

function ProductView() {
	const { product_id } = useParams();

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
				{error ? error.message : `Plan ${product_id} not found`}
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
					<ProductViewBreadcrumbs />

					<div className="flex">
						<div className="flex-1 w-full min-w-sm">
							<ManageProduct />
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

export default ProductView;
