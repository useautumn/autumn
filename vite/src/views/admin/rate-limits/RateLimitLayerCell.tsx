import { formatLimit } from "./formatRateLimit";
import type { RateLimitLayerSummary } from "./rateLimitTypes";

export const RateLimitLayerCell = ({
	layer,
	unit,
}: {
	layer: RateLimitLayerSummary | null;
	unit: string;
}) => {
	if (!layer) return <span className="text-tertiary-foreground">—</span>;
	return (
		<span className="text-sm tabular-nums text-foreground">
			{formatLimit(layer)}
			<span className="ml-1.5 text-tertiary-foreground">{unit}</span>
		</span>
	);
};
