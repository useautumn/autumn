import { cn } from "@autumn/ui/lib/utils";
import { type ReactNode, useEffect, useState } from "react";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";
import { PermissionDenial } from "./permission/PermissionDenial";
import { usePermissionDenial } from "./permission/PermissionDenialContext";

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
	const permission = usePermissionDenial();

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
	const footer =
		layout === "split" ? (
			<SheetFooter className={LAYOUT_CLASSES.split}>{children}</SheetFooter>
		) : (
			<SheetFooter className={LAYOUT_CLASSES[layout]}>
				<div
					className={cn(
						layout === "stacked" && "flex flex-col gap-2 w-full",
						reveal && FADE_CLASS,
					)}
				>
					{children}
				</div>
			</SheetFooter>
		);
	if (!permission) return footer;

	// A disabled fieldset disables every footer action without each footer knowing about rules.
	return (
		<>
			<div className="px-4 pt-4">
				<PermissionDenial section="summary" />
			</div>
			<fieldset disabled={permission.locksSubmit} className="contents">
				{footer}
			</fieldset>
		</>
	);
}
