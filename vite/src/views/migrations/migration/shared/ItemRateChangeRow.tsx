import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { RateChange } from "@/utils/product/featureOverrideRates";

/** A boxed plan item with one subrow per changed rate. */
export function ItemRateChangeRow({
	children,
	changes,
	updated = false,
	compact = false,
	onClick,
}: {
	children: ReactNode;
	changes: RateChange[];
	updated?: boolean;
	compact?: boolean;
	onClick?: () => void;
}) {
	// Header plus the box's two 1px edges (or an edge and a divider) match a lone h-8 / h-10 row.
	const headerClassName = cn(
		"flex items-center gap-2 w-full min-w-0 px-3 text-left shrink-0",
		compact ? "h-[30px]" : "h-[38px]",
		onClick && "cursor-pointer select-none",
	);
	const header = (
		<>
			<div className="flex flex-1 items-center gap-2 min-w-0">{children}</div>
			{updated && (
				<span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] leading-3.5 font-medium text-amber-700 dark:text-amber-400">
					Updated
				</span>
			)}
		</>
	);
	return (
		<div
			className={cn(
				"flex flex-col flex-1 min-w-0 rounded-xl input-base !p-0",
				onClick && "input-state-open-tiny",
			)}
		>
			{onClick ? (
				<button type="button" onClick={onClick} className={headerClassName}>
					{header}
				</button>
			) : (
				<div className={headerClassName}>{header}</div>
			)}
			{changes.map((change) => (
				<div
					className="flex items-center justify-between gap-3 min-w-0 border-t border-input px-3 py-1 text-[11px] leading-4"
					key={change.key}
				>
					<span className="truncate min-w-0 text-tertiary-foreground">
						{change.label}
					</span>
					{change.to !== undefined && (
						<span className="flex items-baseline gap-1 shrink-0 text-xs">
							{change.from !== undefined && (
								<>
									<span className="text-subtle line-through">
										{change.from}
									</span>
									<span className="text-subtle">→</span>
								</>
							)}
							<span className="font-semibold text-foreground">{change.to}</span>
							<span className="text-tertiary-foreground">credits</span>
						</span>
					)}
				</div>
			))}
		</div>
	);
}
