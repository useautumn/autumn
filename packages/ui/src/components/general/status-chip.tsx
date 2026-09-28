import { cn } from "@autumn/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";

export const NEUTRAL_STATUS_ICON_CLASS = "bg-zinc-400 dark:bg-zinc-500";

/** Filled rounded square in the status colour; the glyph svg is sized to fit. */
export function StatusChipIcon({
	icon,
	className = NEUTRAL_STATUS_ICON_CLASS,
}: {
	icon: ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"flex size-3.5 shrink-0 items-center justify-center rounded-[4px] text-white dark:text-black/80 [&>svg]:size-2.5",
				className,
			)}
		>
			{icon}
		</span>
	);
}

/** Neutral chip: only the icon carries status colour, never the label. */
export function StatusChip({
	icon,
	iconClassName,
	dashed = false,
	className,
	children,
	...props
}: ComponentProps<"span"> & {
	icon?: ReactNode;
	iconClassName?: string;
	dashed?: boolean;
}) {
	return (
		<span
			className={cn(
				"inline-flex h-[22px] min-w-0 max-w-full shrink-0 items-center gap-[5px] rounded-md border border-foreground/6 bg-foreground/4 pr-[7px] pl-1 text-xs font-medium whitespace-nowrap text-foreground",
				!icon && "pl-[7px]",
				dashed && "border-dashed border-foreground/15",
				className,
			)}
			{...props}
		>
			{icon && <StatusChipIcon icon={icon} className={iconClassName} />}
			{children}
		</span>
	);
}
