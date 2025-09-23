import { useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useProductChangedAlert } from "../product/hooks/useProductChangedAlert";
import { useProductQuery } from "../product/hooks/useProductQuery";
import { ProductContext } from "../product/ProductContext";
import ConfirmNewVersionDialog from "../product/versioning/ConfirmNewVersionDialog";
import { ManagePlan } from "./components/Editor";
import { EditPlanHeader } from "./components/EditPlanHeader";
import { EditPlanSheet } from "./components/EditPlanSheet";
import { SaveChangesBar } from "./components/SaveChanges";
import { usePlanData } from "./hooks/usePlanData";

export default function PlanEditorView() {
	const { product: originalProduct, isLoading, error } = useProductQuery();
	const { isLoading: featuresLoading } = useFeaturesQuery();

	const { product, setProduct, hasChanges } = usePlanData({ originalProduct });

	const { modal } = useProductChangedAlert({ hasChanges });
	const [showNewVersionDialog, setShowNewVersionDialog] = useState(false);

	if (!product || featuresLoading) return <LoadingScreen />;

	return (
		<ProductContext.Provider
			value={{
				setShowNewVersionDialog,
				product,
				setProduct,
				// entityFeatureIds,
				// setEntityFeatureIds,
				hasChanges,
			}}
		>
			<ConfirmNewVersionDialog
				open={showNewVersionDialog}
				setOpen={setShowNewVersionDialog}
			/>
			<div className="flex w-full h-full overflow-y-auto bg-[#eee]">
				<div className="flex flex-col justify-between h-full flex-1">
					{/* <div className="flex-1"> */}
					<EditPlanHeader />
					<ManagePlan />
					{/* </div> */}
					<SaveChangesBar />
				</div>

				<EditPlanSheet />
			</div>
			{modal}
		</ProductContext.Provider>
	);
}
