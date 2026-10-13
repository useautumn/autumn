import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { CheckIcon } from "@phosphor-icons/react";
import type { Granularity } from "../../utils/intervals";
import { FilterTriggerButton } from "../FilterTriggerButton";
import { useTimeRange } from "./useTimeRange";

const BIN_LABELS: Record<Granularity, string> = {
	hour: "Hour",
	day: "Day",
	week: "Week",
	month: "Month",
};

export const BinSizeCell = () => {
	const { granularities, binSize, setBinSize } = useTimeRange();
	// Some ranges allow a single bin size, so there is nothing to choose.
	const hasChoice = granularities.length > 1;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={!hasChoice}>
				<FilterTriggerButton
					label="By"
					value={BIN_LABELS[binSize].toLowerCase()}
					disabled={!hasChoice}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-36">
				{granularities.map((granularity) => (
					<DropdownMenuItem
						key={granularity}
						onClick={() => setBinSize(granularity)}
						className="justify-between"
					>
						{BIN_LABELS[granularity]}
						{granularity === binSize && (
							<CheckIcon className="text-foreground" />
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
