import { StatusChip, StatusChipIcon } from "@autumn/ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
	type RateChange,
	rateChangeParts,
} from "@/utils/product/featureOverrideRates";
import { ViewChip } from "../../migration-list/cells/ViewChip";
import type { ModificationView } from "../../migration-list/rowView/operationsView";

const SIGNS: Record<
	ModificationView["sign"],
	{ mark: string; className: string }
> = {
	add: { mark: "+", className: "text-[#30A46C]" },
	change: { mark: "~", className: "text-[#E5A21F]" },
	remove: { mark: "−", className: "text-[#E5484D]" },
};

type RowProps = {
	variant?: "row";
	children: ReactNode;
	changes: RateChange[];
	/** The item's rate card alone changed; surfaces with their own lane label hide the tag. */
	updated?: boolean;
	showUpdatedTag?: boolean;
	compact?: boolean;
	onClick?: () => void;
	className?: string;
};
type ChipProps = { variant: "chip"; modification: ModificationView };

/** A plan item with its rate changes beneath it: a boxed row with subrows, or a hover-card chip with nested chips. */
export function ItemRateChangeRow(props: RowProps | ChipProps) {
	if (props.variant === "chip") {
		const { modification } = props;
		const sign = SIGNS[modification.sign];
		const { tile } = modification.chip;
		return (
			// Children sit in the label column; an invisible copy of the parent's icon sizes the column before it.
			<div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-1.5">
				<span
					className={cn(
						"w-2.5 shrink-0 text-center font-semibold",
						sign.className,
					)}
				>
					{sign.mark}
				</span>
				<div className="col-span-2 flex min-w-0">
					<ViewChip chip={modification.chip} />
				</div>
				{modification.children && (
					<>
						{tile && (
							<StatusChipIcon
								className="invisible col-start-2 self-start"
								glyph={tile.glyph}
								tone={tile.tone}
							/>
						)}
						<div className="col-start-3 flex flex-col items-start gap-1.5">
							{modification.children.map((child) => {
								const { from, to, unit } = rateChangeParts(child.change);
								return (
									<StatusChip
										className="h-auto min-h-[22px] items-start whitespace-normal py-[3px]"
										glyph={child.tile.glyph}
										key={child.key}
										tone={child.tile.tone}
									>
										<span className="shrink-0 whitespace-nowrap">
											{child.change.label}
										</span>
										<span className="min-w-0 font-[450] text-tertiary-foreground [overflow-wrap:anywhere]">
											{from !== null && (
												<>
													<span className="text-subtle line-through">
														{from}
													</span>{" "}
													<span className="text-subtle">→</span>{" "}
												</>
											)}
											<span className="font-medium text-foreground">{to}</span>
											{unit}
										</span>
									</StatusChip>
								);
							})}
						</div>
					</>
				)}
			</div>
		);
	}

	const {
		children,
		changes,
		updated = false,
		showUpdatedTag = true,
		compact = false,
		onClick,
		className,
	} = props;
	const header = (
		<>
			<div className="flex flex-1 items-center gap-2 min-w-0">{children}</div>
			{updated && showUpdatedTag && (
				<span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] leading-3.5 font-medium text-amber-700 dark:text-amber-400">
					Updated
				</span>
			)}
		</>
	);
	// Header plus the box's two 1px edges (or an edge and a divider) match a lone h-8 / h-10 row.
	const headerClassName = cn(
		"flex items-center gap-2 w-full min-w-0 px-3 text-left shrink-0",
		compact ? "h-[30px]" : "h-[38px]",
	);
	return (
		<div
			className={cn(
				"flex flex-col flex-1 min-w-0 rounded-xl input-base !p-0",
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
			{changes.map((change) => {
				const { from, to, unit } = rateChangeParts(change);
				return (
					<div
						className="flex items-center justify-between gap-3 min-w-0 border-t border-input px-3 py-1 text-[11px] leading-4"
						key={change.key}
					>
						<span className="truncate min-w-0 text-tertiary-foreground">
							{change.label}
						</span>
						<span className="flex items-baseline gap-1 shrink-0 text-xs">
							{from !== null && (
								<>
									<span className="text-subtle line-through">{from}</span>
									<span className="text-subtle">→</span>
								</>
							)}
							<span className="font-semibold text-foreground">{to}</span>
							{unit && (
								<span className="text-tertiary-foreground">{unit.trim()}</span>
							)}
						</span>
					</div>
				);
			})}
		</div>
	);
}
