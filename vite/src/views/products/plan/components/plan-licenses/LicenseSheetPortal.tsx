import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { useSheet } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetOverlay } from "@/components/v2/sheet-overlay/SheetOverlay";
import { ProductSheets } from "@/views/products/plan/ProductSheets";

/**
 * Full-page overlay + feature sheet for the inline license editor, plus the
 * matching in-card dim. All license layering lives here so the elevation story
 * is in one place:
 *
 * Page scale (portaled, covers the whole page):
 *   OVERLAY_Z (90)          — page dim behind the active editor (shared
 *                             SheetOverlay, which also closes on click-out)
 *   LICENSE_CARD_ACTIVE (95) — lifts the edited card above the dim
 *   SheetPanelHost's panel   — the feature sheet, at InlineSheetPanel's
 *                             SHEET_PANEL_Z_INDEX (100)
 *
 * In-card dim (CARD_DIM_CLASS): sits inside a card's own stacking context, above
 * its PlanCard (z-50), to dim a license card while a *different* editor is active
 * — the page overlay can't reach across editor contexts. Uses the same color +
 * fade as SheetOverlay so cross-context dimming matches.
 */
const OVERLAY_Z = 90;

// Static literals — Tailwind can't generate classes from interpolated strings.
export const LICENSE_CARD_ACTIVE_CLASS = "z-[95]";
const CARD_DIM_CLASS = "z-[60]";

export const LicenseCardDim = ({ show }: { show: boolean }) => (
	<AnimatePresence>
		{show && (
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				className={`absolute -inset-[5px] ${CARD_DIM_CLASS} rounded-2xl bg-white/70 dark:bg-black/70 pointer-events-none`}
			/>
		)}
	</AnimatePresence>
);

/**
 * The license editor's page-level dim + its sheet renderer. The sheet *content*
 * portals into the shared SheetPanelHost (rendered once on the page), so it lives
 * in the same panel the plan uses — switching between a plan feature and a license
 * feature swaps content instead of opening a new panel. ProductSheets renders
 * null in place (it portals), so it's mounted bare here just to run inside the
 * license context. The overlay dims the page and closes the sheet on click-out.
 */
export function LicenseSheetPortal() {
	const mainContent = document.querySelector("[data-main-content]");

	if (!mainContent) return null;

	return (
		<>
			{createPortal(<SheetOverlay inline zIndex={OVERLAY_Z} />, mainContent)}
			<ProductSheets />
		</>
	);
}
