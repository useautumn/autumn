import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { Check } from "lucide-react";
import type { Granularity } from "../../utils/intervals";
import { StripCell } from "./StripCell";
import { useTimeRange } from "./useTimeRange";

const BIN_LABELS: Record<Granularity, string> = {
	hour: "Hour",
	day: "Day",
	week: "Week",
	month: "Month",
};

export const BinSizeCell = ({ className }: { className?: string }) => {
	const { granularities, binSize, setBinSize } = useTimeRange();
	// Some ranges allow a single bin size, so there is nothing to choose.
	const hasChoice = granularities.length > 1;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={!hasChoice}>
				<StripCell
					label="Bin size"
					value={BIN_LABELS[binSize]}
					disabled={!hasChoice}
					className={className}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-36">
				{granularities.map((granularity) => (
					<DropdownMenuItem
						key={granularity}
						onClick={() => setBinSize(granularity)}
						className="flex items-center justify-between"
					>
						{BIN_LABELS[granularity]}
						{granularity === binSize && (
							<Check className="h-3 w-3 text-tertiary-foreground" />
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
