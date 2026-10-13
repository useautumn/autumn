import { overlayLabelClassName } from "@autumn/ui/lib/overlay-classes";
import { useState } from "react";
import { useAnalyticsContext } from "../../AnalyticsContext";
import { groupByLabel } from "../../utils/displayLabels";
import { isBuiltInGroupBy } from "../../utils/groupByColumn";
import { OverlaySearchInput } from "../OverlaySearchInput";
import { CheckRow } from "./CheckRow";
import { useGroupVisibility } from "./useGroupVisibility";

const SEARCH_THRESHOLD = 8;

export const GroupValueChecklist = ({ groupBy }: { groupBy: string }) => {
	const { groupColors } = useAnalyticsContext();
	const {
		groupValues,
		hidden,
		shownCount,
		isFiltered,
		labelFor,
		toggleValue,
		showAll,
	} = useGroupVisibility({ groupBy });
	const [searchValue, setSearchValue] = useState("");

	const matchingValues = groupValues.filter((value) =>
		labelFor(value).toLowerCase().includes(searchValue.toLowerCase()),
	);

	return (
		<div className="flex flex-col">
			<div className="flex items-center justify-between">
				<span className={overlayLabelClassName}>
					Show {groupByLabel({ groupBy }).toLowerCase()} values
				</span>
				{isFiltered && (
					<button
						type="button"
						onClick={showAll}
						className="px-2 text-xs text-tertiary-foreground hover:text-foreground"
					>
						Show all
					</button>
				)}
			</div>
			{groupValues.length > SEARCH_THRESHOLD && (
				<OverlaySearchInput
					placeholder="Search groups..."
					value={searchValue}
					onChange={(e) => setSearchValue(e.target.value)}
					className="-mx-1 mb-1"
				/>
			)}
			<div className="flex max-h-48 flex-col overflow-y-auto">
				{matchingValues.length === 0 && (
					<p className="py-3 text-center text-xs text-tertiary-foreground">
						No groups found.
					</p>
				)}
				{matchingValues.map((value) => {
					const isShown = !hidden.has(value);
					return (
						<CheckRow
							key={value}
							checked={isShown}
							label={labelFor(value)}
							color={groupColors[value]}
							isMonospace={!isBuiltInGroupBy({ groupBy })}
							// The chart needs at least one group left to draw.
							isLocked={isShown && shownCount === 1}
							onToggle={() => toggleValue(value)}
						/>
					);
				})}
			</div>
		</div>
	);
};
