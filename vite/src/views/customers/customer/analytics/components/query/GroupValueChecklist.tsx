import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useAnalyticsContext } from "../../AnalyticsContext";
import { groupByLabel } from "../../utils/displayLabels";
import { isBuiltInGroupBy } from "../../utils/groupByColumn";
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
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between px-2 pt-1.5 pb-1">
				<span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-subtle">
					Show {groupByLabel({ groupBy }).toLowerCase()} values
				</span>
				{isFiltered && (
					<button
						type="button"
						onClick={showAll}
						className="text-xs text-primary hover:text-primary/80"
					>
						Show all
					</button>
				)}
			</div>
			{groupValues.length > SEARCH_THRESHOLD && (
				<div className="flex items-center gap-2 h-7 mx-1.5 px-2 rounded-md border bg-background">
					<MagnifyingGlassIcon size={12} className="text-subtle shrink-0" />
					<input
						type="text"
						placeholder="Search groups..."
						value={searchValue}
						onChange={(e) => setSearchValue(e.target.value)}
						className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-subtle"
					/>
				</div>
			)}
			<div className="flex flex-col max-h-48 overflow-y-auto">
				{matchingValues.length === 0 && (
					<p className="py-3 text-center text-xs text-subtle">
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
