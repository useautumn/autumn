import type { FrontendProduct } from "@autumn/shared";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { ProductProvider } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useInlineProductEditor } from "@/components/v2/inline-custom-plan-editor/useInlineProductEditor";
import { useLicenseSheetStore } from "./useLicenseSheetStore";

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

	return (
		<ProductProvider {...editor} isLicenseEditor={true}>
			{children}
		</ProductProvider>
	);
}
