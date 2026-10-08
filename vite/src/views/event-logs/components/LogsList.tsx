import type { ApiEventsListItem } from "@autumn/shared";
import { Skeleton, StatusChip } from "@autumn/ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { type CSSProperties, useEffect, useRef } from "react";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
	TABLE_TRAY_SURFACE_ROW_CLASS,
} from "@/components/general/table";
import { cn } from "@/lib/utils";
import { useLogFeatures } from "../hooks/useLogFeatures";
import { LogsIcon } from "../LogsIcon";

const ROW_HEIGHT = 40;
const LOADING_ROWS = 24;
/** Rows from the end at which the next page starts loading. */
const PREFETCH_THRESHOLD = 20;

/** One grid template for the header and every row, so columns always line up. */
const ROW_GRID: CSSProperties = {
	display: "grid",
	gridTemplateColumns:
		"130px minmax(0, 200px) minmax(0, 200px) 80px minmax(0, 1fr)",
	columnGap: "16px",
	alignItems: "center",
};

const CELL = "min-w-0 truncate";
const VALUE_CELL = "min-w-0 truncate text-right tabular-nums";
const PROPERTIES_CELL = "min-w-0 truncate pl-4";

const formatLogTime = ({ timestamp }: { timestamp: number }) =>
	format(new Date(timestamp), "d MMM HH:mm:ss");

const formatProperties = ({
	properties,
}: {
	properties: ApiEventsListItem["properties"];
}) =>
	Object.entries(properties ?? {})
		.map(
			([key, value]) =>
				`${key}=${typeof value === "string" ? value : JSON.stringify(value)}`,
		)
		.join(" ");

const ColumnHeaders = () => (
	<div
		style={ROW_GRID}
		className="h-7 px-4 shrink-0 text-xs text-tertiary-foreground"
	>
		<span className={CELL}>Time</span>
		<span className={CELL}>Event</span>
		<span className={CELL}>Customer</span>
		<span className={VALUE_CELL}>Value</span>
		<span className={PROPERTIES_CELL}>Properties</span>
	</div>
);

const LogRow = ({
	event,
	featureName,
	top,
	onOpen,
}: {
	event: ApiEventsListItem;
	featureName: string;
	top: number;
	onOpen: () => void;
}) => (
	<button
		type="button"
		onClick={onOpen}
		style={{ ...ROW_GRID, top, height: ROW_HEIGHT }}
		className={cn(
			"absolute inset-x-0 px-4 text-left",
			TABLE_TRAY_SURFACE_ROW_CLASS,
		)}
	>
		<span className={cn(CELL, "text-xs text-tertiary-foreground")}>
			{formatLogTime({ timestamp: event.timestamp })}
		</span>
		<span className="min-w-0">
			<StatusChip title={event.feature_id}>{featureName}</StatusChip>
		</span>
		<span
			className="min-w-0 truncate text-tiny-id text-tertiary-foreground"
			title={event.customer_id}
		>
			{event.customer_id}
		</span>
		<span
			className={cn(VALUE_CELL, "text-sm font-medium text-muted-foreground")}
		>
			{event.value.toLocaleString()}
		</span>
		<span className="min-w-0 truncate pl-4 text-tiny-id text-subtle">
			{formatProperties({ properties: event.properties })}
		</span>
	</button>
);

export const LogsList = ({
	events,
	isLoading,
	hasNextPage,
	isFetchingNextPage,
	fetchNextPage,
	onOpen,
}: {
	events: ApiEventsListItem[];
	isLoading: boolean;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	fetchNextPage: () => void;
	onOpen: (event: ApiEventsListItem) => void;
}) => {
	const { nameFor } = useLogFeatures();
	const scrollRef = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count: events.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 16,
	});
	const virtualItems = virtualizer.getVirtualItems();
	const lastVisibleIndex = virtualItems[virtualItems.length - 1]?.index ?? 0;

	useEffect(() => {
		const isNearEnd = lastVisibleIndex >= events.length - PREFETCH_THRESHOLD;
		if (isNearEnd && hasNextPage && !isFetchingNextPage) fetchNextPage();
	}, [
		lastVisibleIndex,
		events.length,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
	]);

	const isEmpty = !isLoading && events.length === 0;

	return (
		<div
			className={cn(TABLE_TRAY_CLASS, "flex flex-col flex-1 min-w-0 min-h-0")}
		>
			<ColumnHeaders />
			{isEmpty ? (
				<div
					className={cn(
						TABLE_TRAY_SURFACE_CLASS,
						"flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground",
					)}
				>
					<LogsIcon size={28} strokeWidth={1.5} className="opacity-50" />
					<p className="text-sm">No events match these filters.</p>
				</div>
			) : (
				<div
					ref={scrollRef}
					className={cn(
						TABLE_TRAY_SURFACE_CLASS,
						"flex-1 min-h-0",
						isLoading ? "overflow-hidden" : "overflow-y-auto",
					)}
				>
					{isLoading ? (
						Array.from({ length: LOADING_ROWS }, (_, i) => (
							<div
								key={i}
								className={cn(
									"flex items-center gap-6 px-4",
									TABLE_TRAY_SURFACE_ROW_CLASS,
								)}
								style={{ height: ROW_HEIGHT }}
							>
								<Skeleton className="h-2.5 w-28" />
								<Skeleton className="h-2.5 w-24" />
								<Skeleton className="h-2.5 w-20" />
								<Skeleton className="h-2.5 w-1/3" />
							</div>
						))
					) : (
						<div
							className="relative w-full"
							style={{ height: virtualizer.getTotalSize() + ROW_HEIGHT }}
						>
							{virtualItems.map((item) => {
								const event = events[item.index];
								return (
									<LogRow
										key={event.id}
										event={event}
										featureName={nameFor(event.feature_id)}
										top={item.start}
										onOpen={() => onOpen(event)}
									/>
								);
							})}
							<div
								className="absolute inset-x-0 flex items-center justify-center text-xs text-subtle"
								style={{ top: virtualizer.getTotalSize(), height: ROW_HEIGHT }}
							>
								{isFetchingNextPage
									? "Loading more…"
									: hasNextPage
										? ""
										: `${events.length.toLocaleString()} events`}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
};
