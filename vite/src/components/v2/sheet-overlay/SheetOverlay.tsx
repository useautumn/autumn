import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { useSheet } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";

/**
 * Determines if the sheet should close based on the mouse down event.
 * Clicking out while an input inside the sheet is focused blurs it first instead
 * of closing, so a stray click after typing doesn't unexpectedly dismiss the sheet.
 */
function shouldCloseSheetOnMouseDown({
	e,
	sheetType,
}: {
	e: React.MouseEvent<HTMLDivElement>;
	sheetType: string | null;
}): boolean {
	const activeElement = document.activeElement;

	if (
		activeElement &&
		activeElement !== document.body &&
		activeElement instanceof HTMLElement
	) {
		const isInputElement =
			activeElement.tagName === "INPUT" ||
			activeElement.tagName === "TEXTAREA" ||
			activeElement.tagName === "SELECT";

		if (!isInputElement) {
			return !!sheetType;
		}

		const clickTarget = e.target as HTMLElement;
		const isActiveInSheet = !clickTarget.contains(activeElement);

		if (isActiveInSheet) {
			activeElement.blur();
			e.preventDefault();
			return false;
		}
	}

	return !!sheetType;
}

/**
 * Shared overlay component for plan editors.
 * Portals to [data-main-content] by default, or renders inline if `inline` prop is true.
 */
export function SheetOverlay({ inline = false }: { inline?: boolean }) {
	const { sheetType, closeSheet } = useSheet();

	const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
		if (shouldCloseSheetOnMouseDown({ e, sheetType })) {
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
					data-slot="sheet-overlay"
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
