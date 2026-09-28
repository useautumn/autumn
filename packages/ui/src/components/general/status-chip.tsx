import { cn } from "@autumn/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";

/** Neutral chip: only the leading indicator carries status colour, never the label. */
export function StatusChip({
	indicator,
	dashed = false,
	className,
	children,
	...props
}: ComponentProps<"span"> & { indicator?: ReactNode; dashed?: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex h-[22px] min-w-0 max-w-full shrink-0 items-center gap-[5px] rounded-md border border-foreground/6 bg-foreground/4 pr-[7px] pl-1 text-xs font-medium whitespace-nowrap text-foreground",
				!indicator && "pl-[7px]",
				dashed && "border-dashed border-foreground/15",
				className,
			)}
			{...props}
		>
			{indicator}
			{children}
		</span>
	);
}

/** Filled rounded square in the status colour, e.g. `className="bg-green-500"`. */
export function StatusChipIcon({
	icon,
	className,
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
