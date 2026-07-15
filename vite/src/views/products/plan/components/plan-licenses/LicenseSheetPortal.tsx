import { createPortal } from "react-dom";
import { SheetOverlay } from "@/components/v2/sheet-overlay/SheetOverlay";
import { ProductSheets } from "@/views/products/plan/ProductSheets";

/**
 * Full-page overlay + feature sheet for the inline license editor. License
 * layering, all portaled to page scale:
 *
 *   OVERLAY_Z (90)          — page dim behind the active editor (shared
 *                             SheetOverlay, which also closes on click-out)
 *   LICENSE_CARD_ACTIVE (95) — lifts the edited card above the dim
 *   SheetPanelHost's panel   — the feature sheet, at InlineSheetPanel's
 *                             SHEET_PANEL_Z_INDEX (100)
 *
 * Inactive license cards wrap their PlanCard in `isolate`, so its internal z-50
 * can't escape and whichever overlay is active dims them like the rest of the
 * page — no in-card dim needed.
 */
const OVERLAY_Z = 90;

// Static literal — Tailwind can't generate classes from interpolated strings.
export const LICENSE_CARD_ACTIVE_CLASS = "z-[95]";

/**
 * The license editor's page-level dim + its sheet renderer. The sheet *content*
 * portals into the shared SheetPanelHost (rendered once on the page), so it lives
 * in the same panel the plan uses — switching between a plan feature and a license
 * feature swaps content instead of opening a new panel. ProductSheets renders
 * null in place (it portals), so it's mounted bare here just to run inside the
 * license context. The overlay dims the page and closes the sheet on click-out.
 */
export function LicenseSheetPortal() {
	// Inside the inline customize editor (itself z-100 over the page), the
	// overlay must portal into the editor root or it would sit behind it.
	const portalTarget =
		document.querySelector("[data-inline-editor-open]") ??
		document.querySelector("[data-main-content]");

	if (!portalTarget) return null;

	return (
		<>
			{createPortal(<SheetOverlay inline zIndex={OVERLAY_Z} />, portalTarget)}
			<ProductSheets />
		</>
	);
}
