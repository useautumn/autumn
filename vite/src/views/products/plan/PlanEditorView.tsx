import { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductSync } from "@/hooks/stores/useProductSync";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useProductQuery } from "../product/hooks/useProductQuery";
import { ProductContext } from "../product/ProductContext";
import { EditPlanHeader } from "./components/EditPlanHeader";
import { ManagePlan } from "./components/ManagePlan";
import { SaveChangesBar } from "./components/SaveChangesBar";
import { ProductSheets } from "./ProductSheets";
import ConfirmNewVersionDialog from "./versioning/ConfirmNewVersionDialog";

export default function PlanEditorView() {
	const { product_id } = useParams();

	const {
		product: originalProduct,
		isLoading: productLoading,
		refetch,
		error,
	} = useProductQuery();

	const { isLoading: featuresLoading } = useFeaturesQuery();

	// Sync store with backend data
	useProductSync({ product: originalProduct });

	const [showNewVersionDialog, setShowNewVersionDialog] = useState(false);
	const setSheet = useSheetStore((s) => s.setSheet);

	useEffect(() => {
		setSheet({ type: "edit-plan" });
	}, [setSheet]);

	if (featuresLoading || productLoading) return <LoadingScreen />;

	if (error || !originalProduct) {
		// Handle 500 errors from backend when product doesn't exist
		let errorMessage = `Product ${product_id} not found`;

		if (error instanceof AxiosError && error.response?.status === 500) {
			errorMessage = `Product ${product_id} not found`;
		} else if (error) {
			errorMessage = error.message || `Product ${product_id} not found`;
		}

		return <ErrorScreen returnUrl="/products">{errorMessage}</ErrorScreen>;
	}

	return (
		<ProductContext.Provider
			value={{
				setShowNewVersionDialog,
				refetch,
			}}
		>
			<ConfirmNewVersionDialog
				open={showNewVersionDialog}
				setOpen={setShowNewVersionDialog}
				onVersionCreated={() => {
					// Reset sheet when new version is created
					setSheet({ type: "edit-plan" });
				}}
			/>
			<div className="flex w-full h-full overflow-y-auto bg-gray-medium">
				<div className="flex flex-col justify-between h-full w-full overflow-x-hidden relative">
					<EditPlanHeader />
					<ManagePlan />
					<SaveChangesBar />
				</div>

				<ProductSheets />
			</div>
		</ProductContext.Provider>
	);
}
