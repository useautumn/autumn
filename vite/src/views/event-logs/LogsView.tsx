import type { ApiEventsListItem } from "@autumn/shared";
import { PageContainer } from "@autumn/ui";
import { useState } from "react";
import { UsagePageHeader } from "@/views/customers/customer/analytics/components/UsagePageHeader";
import { EventJsonDialog } from "./components/EventJsonDialog";
import { LogsList } from "./components/LogsList";
import { LogsToolbar } from "./components/LogsToolbar";
import { LogsVolumeStrip } from "./components/LogsVolumeStrip";
import { useLogsEvents } from "./hooks/useLogsEvents";

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
	const [openEvent, setOpenEvent] = useState<ApiEventsListItem | null>(null);

	return (
		<PageContainer className="h-full min-h-0 overflow-hidden text-sm">
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
					onOpen={setOpenEvent}
				/>
			)}
			{openEvent && (
				<EventJsonDialog
					event={openEvent}
					isOpen
					setIsOpen={() => setOpenEvent(null)}
				/>
			)}
		</PageContainer>
	);
};
