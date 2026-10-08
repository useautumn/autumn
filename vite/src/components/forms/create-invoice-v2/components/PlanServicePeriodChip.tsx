import { cn, Popover, PopoverContent } from "@autumn/ui";
import { CalendarBlankIcon } from "@phosphor-icons/react";
import { type ReactNode, useRef } from "react";
import type { FormInvoicePlan } from "../createInvoiceFormSchema";
import { formatServicePeriod } from "../utils/servicePeriod";

const chipLabel = ({ plan }: { plan: FormInvoicePlan }): string | null => {
	const itemCount = Object.keys(plan.featurePeriods).length;
	const items = `${itemCount} item ${itemCount === 1 ? "period" : "periods"}`;
	if (!plan.period) return itemCount > 0 ? items : null;
	const base = formatServicePeriod(plan.period, { compact: true });
	return itemCount > 0 ? `${base} · +${items}` : base;
};

/** A row's service period chip, and the popover that edits it, anchored to the row's line. */
export function PlanServicePeriodChip({
	plan,
	isInvalid,
	open,
	onOpenChange,
	children,
}: {
	plan: FormInvoicePlan;
	isInvalid: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}) {
	const anchorRef = useRef<HTMLSpanElement>(null);
	const label = chipLabel({ plan });

	return (
		<>
			<span ref={anchorRef} className="contents">
				{label && (
					<button
						type="button"
						onClick={() => onOpenChange(true)}
						className={cn(
							"flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs tabular-nums transition-colors",
							isInvalid
								? "border-red-400/60 text-red-500"
								: "border-border text-foreground hover:bg-interactive-secondary-hover",
						)}
					>
						<CalendarBlankIcon size={12} className="shrink-0" />
						{label}
					</button>
				)}
			</span>
			<Popover open={open} onOpenChange={onOpenChange}>
				<PopoverContent
					align="end"
					className="w-auto"
					anchor={() =>
						anchorRef.current?.closest("[data-plan-tray-line]") ?? null
					}
				>
					{open && children}
				</PopoverContent>
			</Popover>
		</>
	);
}
