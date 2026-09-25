import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";

/** A plan Autumn holds that nothing in Stripe bills; each reason names a price. */
export function NotFoundBadge({ reasons }: { reasons: string[] }) {
	if (reasons.length === 0) return null;

	return (
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>
				<Badge
					variant="muted"
					size="sm"
					className="cursor-default text-amber-500"
					tabIndex={0}
				>
					Not found
				</Badge>
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
