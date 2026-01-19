import type { ProductItem } from "@autumn/shared";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import {
	useCurrentItem,
	useHasItemChanges,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";

/**
 * Determines if the sheet should close based on the mouse down event.
 * Handles edge cases like unsaved changes and input blur behavior.
 */
function shouldCloseSheetOnMouseDown({
	e,
	item,
	sheetType,
	hasItemChanges,
}: {
	e: React.MouseEvent<HTMLDivElement>;
	item: ProductItem | null;
	sheetType: string | null;
	hasItemChanges: boolean;
}): boolean {
	// Don't close if item has unsaved changes
	if (hasItemChanges) {
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

/**
 * Shared overlay component for plan editors.
 * Portals to [data-main-content] by default, or renders inline if `inline` prop is true.
 */
export function SheetOverlay({ inline = false }: { inline?: boolean }) {
	const { sheetType, closeSheet } = useSheet();
	const item = useCurrentItem();
	const hasItemChanges = useHasItemChanges();

	const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
		if (shouldCloseSheetOnMouseDown({ e, item, sheetType, hasItemChanges })) {
			closeSheet();
		}
	};

	const overlay = (
		<AnimatePresence>
			{sheetType && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className="absolute inset-0 bg-white/70 dark:bg-black/70"
					style={{ zIndex: 40 }}
					onMouseDown={handleMouseDown}
				/>
			)}
		</AnimatePresence>
	);

	if (inline) {
		return overlay;
	}

	const mainContent = document.querySelector("[data-main-content]");
	if (!mainContent) {
		console.error("[SheetOverlay] Could not find portal target");
		return null;
	}

	return createPortal(overlay, mainContent);
}
