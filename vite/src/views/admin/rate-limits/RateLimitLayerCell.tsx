import { cn } from "@autumn/ui/lib/utils";
import { formatLimit } from "./formatRateLimit";
import type { RateLimitLayerSummary } from "./rateLimitTypes";

export const RateLimitLayerCell = ({
	layer,
	unit,
	className,
}: {
	layer: RateLimitLayerSummary | null;
	unit: string;
	className?: string;
}) => {
	if (!layer) {
		return (
			<span
				className={cn("hidden text-tertiary-foreground md:inline", className)}
			>
				—
			</span>
		);
	}
	return (
		<span className={cn("text-sm tabular-nums text-foreground", className)}>
			{formatLimit(layer)}
			<span className="ml-1.5 text-tertiary-foreground">{unit}</span>
		</span>
	);
};
