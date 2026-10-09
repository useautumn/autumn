import type { ApiEventsListItem } from "@autumn/shared";
import { PageContainer } from "@autumn/ui";
import { useState } from "react";
import { UsagePageHeader } from "@/views/customers/customer/analytics/components/UsagePageHeader";
import { LogDetailPane } from "./components/LogDetailPane";
import { LogsList } from "./components/LogsList";
import { LogsToolbar } from "./components/LogsToolbar";
import { LogsVolumeStrip } from "./components/LogsVolumeStrip";
import { useLogsEvents } from "./hooks/useLogsEvents";
import { useLogsFilters } from "./hooks/useLogsFilters";

/** Logs tab of the Usage page: every tracked event, newest first. */
export const LogsView = () => {
	const {
		events,
		isLoading,
		error,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
	} = useLogsEvents();
	const [selected, setSelected] = useState<ApiEventsListItem | null>(null);

	// Drop the open event once the list it came from is filtered away.
	const { filters } = useLogsFilters();
	const filterKey = JSON.stringify([
		filters.feature_id,
		filters.customer_id,
		filters.range,
		filters.properties,
	]);
	const [selectedFilterKey, setSelectedFilterKey] = useState(filterKey);
	if (selectedFilterKey !== filterKey) {
		setSelectedFilterKey(filterKey);
		setSelected(null);
	}

	return (
		<div className="flex h-full min-h-0 w-full">
			<PageContainer className="h-full min-h-0 min-w-0 overflow-hidden text-sm">
				<UsagePageHeader activeTab="logs" />
				<LogsToolbar />
				<LogsVolumeStrip />
				{error ? (
					<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
						Couldn't load events. {error.message}
					</div>
				) : (
					<LogsList
						events={events}
						isLoading={isLoading}
						hasNextPage={hasNextPage}
						isFetchingNextPage={isFetchingNextPage}
						fetchNextPage={fetchNextPage}
						selectedId={selected?.id ?? null}
						onSelect={setSelected}
					/>
				)}
			</PageContainer>
			{selected && (
				<LogDetailPane event={selected} onClose={() => setSelected(null)} />
			)}
		</div>
	);
};
