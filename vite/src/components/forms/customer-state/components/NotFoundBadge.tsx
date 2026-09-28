import {
	StatusChip,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";

/** A plan Autumn holds that nothing in Stripe bills; each reason names a price. */
export function NotFoundBadge({ reasons }: { reasons: string[] }) {
	if (reasons.length === 0) return null;

	return (
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>
				<StatusChip
					tone="amber"
					glyph="alert"
					className="cursor-default"
					tabIndex={0}
				>
					Not found
				</StatusChip>
			</TooltipTrigger>
			<TooltipContent side="top" className="max-w-72">
				<ul className="space-y-1">
					{reasons.map((reason) => (
						<li key={reason}>{reason}</li>
					))}
				</ul>
			</TooltipContent>
		</Tooltip>
	);
}
