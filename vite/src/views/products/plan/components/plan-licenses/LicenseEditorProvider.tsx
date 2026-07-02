import type { FrontendProduct } from "@autumn/shared";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { ProductProvider } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useInlineProductEditor } from "@/components/v2/inline-custom-plan-editor/useInlineProductEditor";
import { useLicenseSheetStore } from "./useLicenseSheetStore";

/**
 * Editor context for an inline license card. Same as InlineEditorProvider (local
 * draft + local sheet state, so each license edits independently and its sheet
 * never collides with the page's), but it mirrors its sheet open/close to the
 * page so PlanEditor can shift content for a license sheet exactly as for the
 * plan's own.
 */
export function LicenseEditorProvider({
	children,
	initialProduct,
}: {
	children: ReactNode;
	initialProduct: FrontendProduct;
}) {
	const reportOpen = useLicenseSheetStore((s) => s.reportOpen);
	const reportClosed = useLicenseSheetStore((s) => s.reportClosed);

	const hasReportedOpenRef = useRef(false);
	const onSheetOpenChange = useCallback(
		(open: boolean) => {
			hasReportedOpenRef.current = open;
			if (open) {
				reportOpen();
			} else {
				reportClosed();
			}
		},
		[reportOpen, reportClosed],
	);

	// The ref-counted store leaks a count if this editor unmounts while its
	// sheet is still open, so release it on unmount.
	useEffect(
		() => () => {
			if (hasReportedOpenRef.current) {
				hasReportedOpenRef.current = false;
				reportClosed();
			}
		},
		[reportClosed],
	);

	const editor = useInlineProductEditor({
		initialProduct,
		onSheetOpenChange,
	});

	return <ProductProvider {...editor}>{children}</ProductProvider>;
}
