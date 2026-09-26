import type { ApiEventsListItem } from "@autumn/shared";
import { useState } from "react";
import { UsagePageHeader } from "@/views/customers/customer/analytics/components/UsagePageHeader";
import { LogDetailPane } from "./components/LogDetailPane";
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
	const [selected, setSelected] = useState<ApiEventsListItem | null>(null);

	return (
		<div className="flex flex-col h-full min-h-0 w-full text-sm">
			{/* Same box as PageContainer on the Overview tab, so the header lines up. */}
			<div className="w-full max-w-[1600px] mx-auto pt-4 sm:pt-8 px-4 sm:px-10 shrink-0">
				<UsagePageHeader activeTab="logs" />
			</div>
			<LogsToolbar />
			<div className="px-4 pt-3.5 pb-2.5 shrink-0 border-b">
				<LogsVolumeStrip />
			</div>
			{error ? (
				<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
					Couldn't load events. {error.message}
				</div>
			) : (
				<div className="flex flex-1 min-h-0">
					<LogsList
						events={events}
						isLoading={isLoading}
						hasNextPage={hasNextPage}
						isFetchingNextPage={isFetchingNextPage}
						fetchNextPage={fetchNextPage}
						selectedId={selected?.id ?? null}
						onSelect={setSelected}
					/>
					{selected && (
						<LogDetailPane event={selected} onClose={() => setSelected(null)} />
					)}
				</div>
			)}
		</div>
	);
};
