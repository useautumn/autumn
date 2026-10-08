import { Skeleton } from "@autumn/ui";
import { type ReactNode, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useAnalyticsContext } from "../../AnalyticsContext";
import { useAnalyticsFilterState } from "../../hooks/useAnalyticsFilterState";
import { useAnalyticsQueryState } from "../../hooks/useAnalyticsQueryState";
import {
	type EventNameWithCount,
	useEventNames,
} from "../../hooks/useEventNames";
import {
	eventDisplayName,
	findFeaturesForEvent,
} from "../../utils/eventFeatures";
import { getEffectiveBinSize } from "../../utils/intervals";
import { OverlaySearchInput } from "../OverlaySearchInput";
import { CheckRow } from "./CheckRow";
import { useEventSelection } from "./useEventSelection";

const SEARCH_THRESHOLD = 5;
const LOADING_ROWS = 3;

const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });

/** The header sits under the search row, above the events. */
export const EventsChecklist = ({ header }: { header?: ReactNode }) => {
	const { features, eventColors } = useAnalyticsContext();
	const { queryStates } = useAnalyticsQueryState();
	const { filterStates } = useAnalyticsFilterState();
	const { selectedEventNames, toggleEvent } = useEventSelection();
	const [searchValue, setSearchValue] = useState("");

	const { eventNames, isLoading, isRefreshing } = useEventNames({
		keepPrevious: true,
		customerId: filterStates.customer_id,
		entityId: filterStates.entity_id,
		interval: queryStates.interval,
		binSize: getEffectiveBinSize({
			interval: queryStates.interval,
			binSize: queryStates.bin_size,
		}),
		start: queryStates.start,
		end: queryStates.end,
	});

	const visibleEvents: EventNameWithCount[] = useMemo(() => {
		const search = searchValue.toLowerCase();
		if (!search) return eventNames;
		return eventNames.filter((event: EventNameWithCount) => {
			const linkedFeatures = findFeaturesForEvent({
				eventName: event.event_name,
				features,
			});
			return (
				event.event_name.toLowerCase().includes(search) ||
				linkedFeatures.some(
					(feature) =>
						feature.id.toLowerCase().includes(search) ||
						feature.name.toLowerCase().includes(search),
				)
			);
		});
	}, [eventNames, features, searchValue]);

	const selectedNames = new Set(selectedEventNames);

	return (
		<>
			{eventNames.length > SEARCH_THRESHOLD && (
				<OverlaySearchInput
					placeholder="Search events or features..."
					value={searchValue}
					onChange={(e) => setSearchValue(e.target.value)}
					className="-mx-1 -mt-1 mb-1"
				/>
			)}
			{header}
			<div
				className={cn(
					"flex max-h-[240px] flex-col overflow-y-auto transition-opacity duration-200",
					isRefreshing && "opacity-50",
				)}
			>
				{isLoading &&
					Array.from({ length: LOADING_ROWS }, (_, i) => (
						<div key={i} className="flex h-[30px] items-center gap-2 px-2">
							<Skeleton className="size-3.5 shrink-0 rounded-[4px]" />
							<Skeleton className="h-2.5 flex-1 max-w-32" />
							<Skeleton className="h-2.5 w-8 ml-auto" />
						</div>
					))}
				{!isLoading && visibleEvents.length === 0 && (
					<p className="py-3 text-center text-xs text-tertiary-foreground">
						No events found.
					</p>
				)}
				{visibleEvents.map((event: EventNameWithCount) => (
					<CheckRow
						key={event.event_name}
						checked={selectedNames.has(event.event_name)}
						// The feature name reads better; the raw event name stays on hover.
						label={eventDisplayName({ eventName: event.event_name, features })}
						title={event.event_name}
						trailing={compactNumber.format(event.event_count)}
						color={eventColors[event.event_name]}
						onToggle={() => toggleEvent(event.event_name)}
					/>
				))}
			</div>
		</>
	);
};
