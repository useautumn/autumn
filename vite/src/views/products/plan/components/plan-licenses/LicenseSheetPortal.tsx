import { createPortal } from "react-dom";
import { SheetOverlay } from "@/components/v2/sheet-overlay/SheetOverlay";
import { ProductSheets } from "@/views/products/plan/ProductSheets";

const OVERLAY_Z = 90;

// Static literal — Tailwind can't generate classes from interpolated strings.
export const LICENSE_CARD_ACTIVE_CLASS = "z-[95]";

export function LicenseSheetPortal() {
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
