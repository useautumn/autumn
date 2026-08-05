import { type ReactNode, useEffect, useState } from "react";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";

const REVEAL_DELAY_MS = 350;
const FADE_CLASS = "animate-in fade-in duration-200";

/** Stacked = invoice button above confirm; split = two side by side; single = one. */
export type BillingFooterLayout = "stacked" | "split" | "single";

const LAYOUT_CLASSES: Record<BillingFooterLayout, string> = {
	stacked: "flex flex-col grid-cols-1 mt-0",
	split: "grid-cols-2",
	single: "grid-cols-1",
};

/** Wrap each button in a split-layout footer so they fade independently. */
export function BillingFooterButton({ children }: { children: ReactNode }) {
	return <div className={FADE_CLASS}>{children}</div>;
}

export function BillingFooter({
	layout,
	isReady = true,
	reveal = false,
	children,
}: {
	layout: BillingFooterLayout;
	/** Gate on preview readiness; only meaningful when reveal is true. */
	isReady?: boolean;
	/** Wait, then fade in, rather than rendering immediately. */
	reveal?: boolean;
	children: ReactNode;
}) {
	const [showFooter, setShowFooter] = useState(false);

	useEffect(() => {
		if (!reveal) return;
		if (isReady) {
			const timer = setTimeout(() => setShowFooter(true), REVEAL_DELAY_MS);
			return () => clearTimeout(timer);
		}
		setShowFooter(false);
	}, [isReady, reveal]);

	if (reveal && !showFooter) return null;

	// Split callers fade each button themselves via BillingFooterButton.
	if (layout === "split") {
		return (
			<SheetFooter className={LAYOUT_CLASSES.split}>{children}</SheetFooter>
		);
	}

	return (
		<SheetFooter className={LAYOUT_CLASSES[layout]}>
			<div
				className={`${layout === "stacked" ? "flex flex-col gap-2 w-full" : ""} ${
					reveal ? FADE_CLASS : ""
				}`.trim()}
			>
				{children}
			</div>
		</SheetFooter>
	);
}
