import { useEffect } from "react";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useWorkbenchStore } from "@/hooks/stores/useWorkbenchStore";

const shouldDeferEscape = (target: Element | null): boolean => {
	if (target?.closest(".monaco-editor")) return true;
	if (useSheetStore.getState().type !== null) return true;
	return (
		!!document.querySelector('[role="dialog"][data-state="open"]') ||
		!!document.querySelector('[role="alertdialog"][data-state="open"]') ||
		!!document.querySelector("dialog[open]") ||
		!!document.querySelector("[data-inline-editor-open]")
	);
};

export const useWorkbenchEscape = () => {
	const isOpen = useWorkbenchStore((s) => s.isOpen);
	const close = useWorkbenchStore((s) => s.close);

	useEffect(() => {
		if (!isOpen) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || e.defaultPrevented) return;
			if (shouldDeferEscape(e.target as Element | null)) return;
			close();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isOpen, close]);
};
