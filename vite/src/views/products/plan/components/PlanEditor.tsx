import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import {
	useCurrentItem,
	useIsCusPlanEditor,
} from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { checkItemIsValid } from "@/utils/product/entitlementUtils";
import { CustomerPlanInfoBox } from "@/views/customers2/customer-plan/CustomerPlanInfoBox";
import { ProductSheets } from "../ProductSheets";
import { SHEET_ANIMATION } from "../planAnimations";
import { EditPlanHeader } from "./EditPlanHeader";
import PlanCard from "./plan-card/PlanCard";
import { SaveChangesBar } from "./SaveChangesBar";

function shouldCloseSheetOnMouseDown({
	e,
	item,
	sheetType,
}: {
	e: React.MouseEvent<HTMLDivElement>;
	item: ReturnType<typeof useCurrentItem>;
	sheetType: string | null;
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

export const PlanEditor = () => {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const sheetType = useSheetStore((s) => s.type);
	const item = useCurrentItem();

	return (
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
						className="flex flex-col w-full h-fit items-center justify-start pt-20 px-10 gap-4"
						// onMouseDown={(e) => {
						// 	if (shouldCloseSheetOnMouseDown({ e, item, sheetType })) {
						// 		closeSheet();
						// 	}
						// }}
					>
						{useIsCusPlanEditor() && <CustomerPlanInfoBox />}
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
	);
};
