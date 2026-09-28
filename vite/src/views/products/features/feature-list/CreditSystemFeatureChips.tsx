import {
	StatusChip,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";

const VISIBLE_CHIP_COUNT = 2;

export function CreditSystemFeatureChips({ labels }: { labels: string[] }) {
	if (labels.length === 0) {
		return <span className="text-subtle">—</span>;
	}

	const hiddenLabels = labels.slice(VISIBLE_CHIP_COUNT);

	return (
		<div className="flex min-w-0 items-center gap-1">
			{labels.slice(0, VISIBLE_CHIP_COUNT).map((label) => (
				<StatusChip key={label} className="min-w-0">
					<span className="truncate">{label}</span>
				</StatusChip>
			))}
			{hiddenLabels.length > 0 && (
				<Tooltip>
					<TooltipTrigger asChild>
						<StatusChip className="px-1.5 text-tertiary-foreground tabular-nums">
							+{hiddenLabels.length}
						</StatusChip>
					</TooltipTrigger>
					<TooltipContent>{hiddenLabels.join(", ")}</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}
