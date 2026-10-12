import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { RateChange } from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";
import { RateChangeRow } from "./RateChangeRow";

/** A plan item row with its rate changes as subrows; `updated` marks an item whose rate card alone changed. */
export function ItemRateChangeRow({
	children,
	changes,
	updated = false,
	compact = false,
	onClick,
	className,
}: {
	children: ReactNode;
	changes: RateChange[];
	updated?: boolean;
	compact?: boolean;
	onClick?: () => void;
	className?: string;
}) {
	const header = (
		<>
			<div className="flex flex-1 items-center gap-2 min-w-0 [&>div]:flex-1 [&>div]:min-w-0">
				{children}
			</div>
			{updated && (
				<span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] leading-3.5 font-medium text-amber-700 dark:text-amber-400">
					Updated
				</span>
			)}
		</>
	);
	const headerClassName = cn(
		"flex items-center gap-2 w-full min-w-0 px-3 text-left",
		compact ? "h-8" : "h-10",
	);

	return (
		<div
			className={cn(
				"flex flex-col flex-1 min-w-0 rounded-xl input-base",
				onClick && "input-state-open-tiny",
				className,
			)}
		>
			{onClick ? (
				<button
					type="button"
					onClick={onClick}
					className={cn(headerClassName, "cursor-pointer select-none")}
				>
					{header}
				</button>
			) : (
				<div className={headerClassName}>{header}</div>
			)}
			{changes.map((change) => (
				<RateChangeRow change={change} key={change.key} />
			))}
		</div>
	);
}
