import type { PlanTiming } from "@autumn/shared";
import {
	IconCheckbox,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { cn } from "@/lib/utils";

/** Immediately / End of cycle; `locked` pins it to Immediately while the anchor resets now. */
export function AttachPlanScheduleRow({
	isImmediateSelected,
	isEndOfCycleSelected,
	hasOutgoing,
	locked,
	onChange,
}: {
	isImmediateSelected: boolean;
	isEndOfCycleSelected: boolean;
	hasOutgoing: boolean;
	locked: boolean;
	onChange: (schedule: PlanTiming) => void;
}) {
	return (
		<ConfigRow
			title="Plan Schedule"
			description="When the new plan should take effect"
			action={
				<>
					<IconCheckbox
						variant="secondary"
						size="sm"
						checked={isImmediateSelected || locked}
						disabled={locked}
						onCheckedChange={() => onChange("immediate")}
						className={cn(
							"min-w-[76px] px-2 text-xs rounded-r-none",
							!isImmediateSelected && !locked && "border-r-0",
						)}
					>
						Immediately
					</IconCheckbox>
					<Tooltip>
						<TooltipTrigger render={<span className="inline-flex" />}>
							<IconCheckbox
								variant="secondary"
								size="sm"
								checked={isEndOfCycleSelected && !locked}
								disabled={!hasOutgoing || locked}
								onCheckedChange={() => onChange("end_of_cycle")}
								className={cn(
									"min-w-[76px] px-2 text-xs rounded-l-none",
									!isEndOfCycleSelected && "border-l-0",
								)}
							>
								End of cycle
							</IconCheckbox>
						</TooltipTrigger>
						{!hasOutgoing && (
							<TooltipContent>
								Only available when transitioning from an existing plan
							</TooltipContent>
						)}
					</Tooltip>
				</>
			}
		/>
	);
}
