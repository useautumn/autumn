import { useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useHasChanges } from "@/hooks/stores/useProductStore";
import { useProductSync } from "@/hooks/stores/useProductSync";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useProductChangedAlert } from "../product/hooks/useProductChangedAlert";
import { useProductQuery } from "../product/hooks/useProductQuery";
import { ProductContext } from "../product/ProductContext";
import { EditPlanHeader } from "./components/EditPlanHeader";
import { ManagePlan } from "./components/ManagePlan";
import { SaveChangesBar } from "./components/SaveChangesBar";
import { ProductSheets } from "./ProductSheets";
import ConfirmNewVersionDialog from "./versioning/ConfirmNewVersionDialog";

export default function PlanEditorView() {
	const {
		product: originalProduct,
		isLoading: productLoading,
		refetch,
	} = useProductQuery();

	const { isLoading: featuresLoading } = useFeaturesQuery();

	// Sync store with backend data
	useProductSync({ product: originalProduct });

	const hasChanges = useHasChanges();
	const { modal } = useProductChangedAlert({ hasChanges });

	const [showNewVersionDialog, setShowNewVersionDialog] = useState(false);
	const setSheet = useSheetStore((s) => s.setSheet);

	if (featuresLoading || productLoading) return <LoadingScreen />;

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
			<div className="flex w-full h-full overflow-y-auto bg-[#eee]">
				<div className="flex flex-col justify-between h-full w-full overflow-x-hidden relative">
					<EditPlanHeader />
					<ManagePlan />
					<SaveChangesBar />
				</div>

				<ProductSheets />
			</div>
			{modal}
		</ProductContext.Provider>
	);
}
