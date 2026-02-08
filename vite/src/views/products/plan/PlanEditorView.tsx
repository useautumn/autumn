import { productV2ToFeatureItems } from "@autumn/shared";
import { AxiosError } from "axios";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useDiscardItemAndClose } from "@/hooks/stores/useProductStore";
import { useProductSync } from "@/hooks/stores/useProductSync";
import {
	useSheetCleanup,
	useSheetEscapeHandler,
} from "@/hooks/stores/useSheetStore";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useProductQuery } from "../product/hooks/useProductQuery";
import { ProductContext } from "../product/ProductContext";
import { PlanEditor } from "./components/PlanEditor";
import { useOpenAddFeatureSheet } from "./hooks/useOpenAddFeatureSheet";
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
	const openAddFeatureSheet = useOpenAddFeatureSheet();
	const hasAutoOpenedAddFeatureRef = useRef(false);

	// Auto-open add feature sheet when plan has no features (e.g., newly created plan)
	useEffect(() => {
		if (!originalProduct || hasAutoOpenedAddFeatureRef.current) return;

		const featureItems = productV2ToFeatureItems({
			items: originalProduct.items,
		});
		if (featureItems.length === 0) {
			openAddFeatureSheet();
			hasAutoOpenedAddFeatureRef.current = true;
		}
	}, [originalProduct, openAddFeatureSheet]);

	// Custom close handler that discards item changes before closing
	const discardAndClose = useDiscardItemAndClose();

	// Handle Escape key to close sheet and unfocus (with discard)
	useSheetEscapeHandler({ onClose: discardAndClose });

	// Close sheet when navigating away from this view
	useSheetCleanup();

	if (featuresLoading || productLoading) return <LoadingScreen />;

	if (error || !originalProduct) {
		// Handle 500 errors from backend when product doesn't exist
		let errorMessage = `Plan ${product_id} not found`;

		if (error instanceof AxiosError && error.response?.status === 500) {
			errorMessage = `Plan ${product_id} not found`;
		} else if (error) {
			errorMessage = error.message || `Plan ${product_id} not found`;
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
			/>
			<PlanEditor />
		</ProductContext.Provider>
	);
}
