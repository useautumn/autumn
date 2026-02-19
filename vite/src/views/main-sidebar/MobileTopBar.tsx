import { ListIcon } from "@phosphor-icons/react";

/** Thin sticky bar shown only on mobile with hamburger menu trigger. */
export function MobileTopBar({ onMenuClick }: { onMenuClick: () => void }) {
	return (
		<div className="sticky top-0 z-50 flex items-center h-11 px-3 bg-background border-b border-border/40 sm:hidden">
			<button
				type="button"
				onClick={onMenuClick}
				className="flex items-center justify-center size-8 -ml-1 rounded-md text-t2 hover:text-t1 hover:bg-accent/50 transition-colors"
				aria-label="Open menu"
			>
				<ListIcon size={18} weight="bold" />
			</button>
		</div>
	);
}
