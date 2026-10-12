import type { ReactNode } from "react";

export function RateCardHeader({
	subtitle,
	action,
}: {
	subtitle: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex items-end justify-between gap-3">
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="font-medium text-foreground text-sm">Rate card</span>
				<span className="truncate text-tertiary-foreground text-xs">
					{subtitle}
				</span>
			</div>
			{action}
		</div>
	);
}
