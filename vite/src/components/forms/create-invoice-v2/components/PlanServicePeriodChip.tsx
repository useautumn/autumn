import { cn, Popover, PopoverContent } from "@autumn/ui";
import { CalendarBlankIcon } from "@phosphor-icons/react";
import { useRef } from "react";
import type { ServicePeriod } from "../createInvoiceFormSchema";
import { formatServicePeriod } from "../utils/servicePeriod";
import { ServicePeriodPicker } from "./ServicePeriodPicker";

/** A row's service period chip, and the popover that sets it, anchored to the row's line. */
export function PlanServicePeriodChip({
	period,
	isInvalid,
	open,
	onOpenChange,
	onApply,
}: {
	period: ServicePeriod | null;
	isInvalid: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onApply: (period: ServicePeriod | null) => void;
}) {
	const anchorRef = useRef<HTMLSpanElement>(null);

	return (
		<>
			<span ref={anchorRef} className="contents">
				{period && (
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
						{formatServicePeriod(period, { compact: true })}
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
					<ServicePeriodPicker
						value={period}
						onApply={(next) => {
							onApply(next);
							onOpenChange(false);
						}}
					/>
				</PopoverContent>
			</Popover>
		</>
	);
}
