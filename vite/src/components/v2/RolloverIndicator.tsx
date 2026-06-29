import {
	type RolloverConfig,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { CircleHalfTiltIcon } from "@phosphor-icons/react";

function maxValue(rollover: RolloverConfig): string {
	if (rollover.max_percentage != null) return `${rollover.max_percentage}%`;
	if (rollover.max == null) return "Unlimited";
	return String(rollover.max);
}

function durationValue(rollover: RolloverConfig): string {
	if (rollover.duration === RolloverExpiryDurationType.Forever)
		return "Forever";
	const months = rollover.length === 1 ? "month" : "months";
	return `${rollover.length} ${months}`;
}

/** Small icon shown at the end of an item row when the item rolls over unused
 * usage. Hover reveals the rollover config fields. */
export function RolloverIndicator({ rollover }: { rollover: RolloverConfig }) {
	const rows = [
		{ label: "Max", value: maxValue(rollover) },
		{ label: "Duration", value: durationValue(rollover) },
	];

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<CircleHalfTiltIcon
					className="size-3.5 shrink-0 text-tertiary-foreground"
					aria-label="Rolls over"
				/>
			</TooltipTrigger>
			<TooltipContent side="top">
				<div className="flex flex-col gap-0.5">
					<span className="text-body font-medium">Rollover</span>
					{rows.map((row) => (
						<div
							className="flex items-center justify-between gap-4"
							key={row.label}
						>
							<span className="text-body-secondary">{row.label}</span>
							<span className="tabular-nums">{row.value}</span>
						</div>
					))}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
