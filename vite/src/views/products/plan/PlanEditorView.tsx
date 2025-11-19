import { AxiosError } from "axios";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useCurrentItem } from "@/hooks/stores/useProductStore";
import { useProductSync } from "@/hooks/stores/useProductSync";
import {
	useSheetCleanup,
	useSheetEscapeHandler,
	useSheetStore,
} from "@/hooks/stores/useSheetStore";
import { checkItemIsValid } from "@/utils/product/entitlementUtils";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useProductQuery } from "../product/hooks/useProductQuery";
import { ProductContext } from "../product/ProductContext";
import { EditPlanHeader } from "./components/EditPlanHeader";
import PlanCard from "./components/plan-card/PlanCard";
import { SaveChangesBar } from "./components/SaveChangesBar";
import { ProductSheets } from "./ProductSheets";
import { SHEET_ANIMATION } from "./planAnimations";
import ConfirmNewVersionDialog from "./versioning/ConfirmNewVersionDialog";

function shouldCloseSheetOnMouseDown({
	e,
	item,
	sheetType,
}: {
	e: React.MouseEvent<HTMLDivElement>;
	item: ReturnType<typeof useCurrentItem>;
	sheetType:
		| "edit-plan"
		| "edit-plan-price"
		| "edit-feature"
		| "new-feature"
		| "select-feature"
		| null;
}): boolean {
	// Don't close if item is invalid

	if (item && !checkItemIsValid(item, false)) {
		return false;
	}

	// Get the active element before blur happens
	const activeElement = document.activeElement;

	if (
		activeElement &&
		activeElement !== document.body &&
		activeElement instanceof HTMLElement
	) {
		// Only apply blur behavior to inputs, textareas, and selects
		const isInputElement =
			activeElement.tagName === "INPUT" ||
			activeElement.tagName === "TEXTAREA" ||
			activeElement.tagName === "SELECT";

		if (!isInputElement) {
			// Not an input, proceed with normal close behavior
			return !!sheetType;
		}

		// Check if the active element is within the sheet (not in the main content area)
		const clickTarget = e.target as HTMLElement;
		const isActiveInSheet = !clickTarget.contains(activeElement);

		if (isActiveInSheet) {
			activeElement.blur();
			e.preventDefault(); // Prevent default to stop the click from propagating
			return false;
		}
	}

	// If the click is outside the sheet and no input is focused, close the sheet
	return !!sheetType;
}

export default function PlanEditorView() {
	const { product_id } = useParams();

	const {
		product: originalProduct,
		isLoading: productLoading,
		refetch,
		error,
	} = useProductQuery();

	const { isLoading: featuresLoading } = useFeaturesQuery();

	const item = useCurrentItem();

	// Sync store with backend data
	useProductSync({ product: originalProduct });

	const [showNewVersionDialog, setShowNewVersionDialog] = useState(false);
	const setSheet = useSheetStore((s) => s.setSheet);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const sheetType = useSheetStore((s) => s.type);

	// Handle Escape key to close sheet and unfocus
	useSheetEscapeHandler();

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
				onVersionCreated={() => {
					// Reset sheet when new version is created
					setSheet({ type: "edit-plan" });
				}}
			/>
			<div className="flex w-full h-full overflow-hidden relative">
				<motion.div
					className="h-full overflow-hidden absolute inset-0"
					animate={{
						width: sheetType ? "calc(100% - 28rem)" : "100%",
					}}
					transition={SHEET_ANIMATION}
				>
					<div className="flex flex-col justify-start h-full w-full overflow-x-hidden overflow-y-auto pb-20">
						<div onClick={(e) => e.stopPropagation()}>
							<EditPlanHeader />
						</div>
						{/* <ManagePlan /> */}
						<div
							className="flex flex-col w-full h-fit items-center justify-start pt-20 px-10"
							// onMouseDown={(e) => {
							// 	if (shouldCloseSheetOnMouseDown({ e, item, sheetType })) {
							// 		closeSheet();
							// 	}
							// }}
						>
							<PlanCard />
						</div>
						<div onClick={(e) => e.stopPropagation()}>
							<SaveChangesBar />
						</div>
					</div>
					{createPortal(
						<AnimatePresence>
							{sheetType && (
								<motion.div
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									className="fixed inset-0 bg-background/70"
									style={{ zIndex: 40 }}
									onMouseDown={(e) => {
										if (shouldCloseSheetOnMouseDown({ e, item, sheetType })) {
											closeSheet();
										}
									}}
								/>
							)}
						</AnimatePresence>,
						document.body,
					)}
				</motion.div>

				<ProductSheets />
			</div>
		</ProductContext.Provider>
	);
}
