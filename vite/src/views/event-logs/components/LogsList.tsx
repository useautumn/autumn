import type { ApiEventsListItem } from "@autumn/shared";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { useEffect, useRef } from "react";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
	TABLE_TRAY_SURFACE_ROW_CLASS,
} from "@/components/general/table";
import { cn } from "@/lib/utils";
import { useLogFeatures } from "../hooks/useLogFeatures";
import { LogsIcon } from "../LogsIcon";
import { LogsSkeletonRow } from "./LogsSkeletonRow";
import { ROW_GRID, ROW_HEIGHT } from "./logsListGrid";

const LOADING_ROWS = 24;
/** Rows from the end at which the next page starts loading. */
const PREFETCH_THRESHOLD = 20;

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
	color,
	isSelected,
	top,
	onSelect,
}: {
	event: ApiEventsListItem;
	featureName: string;
	color: string;
	isSelected: boolean;
	top: number;
	onSelect: () => void;
}) => (
	<button
		type="button"
		onClick={onSelect}
		aria-pressed={isSelected}
		style={{ ...ROW_GRID, top, height: ROW_HEIGHT }}
		className={cn(
			"absolute inset-x-0 px-4 text-left",
			TABLE_TRAY_SURFACE_ROW_CLASS,
			isSelected && "bg-table-row-hover",
		)}
	>
		<span
			className={cn(
				CELL,
				"text-xs",
				isSelected ? "text-foreground" : "text-tertiary-foreground",
			)}
		>
			{formatLogTime({ timestamp: event.timestamp })}
		</span>
		<span className="flex items-center gap-2 min-w-0" title={event.feature_id}>
			<span
				className="size-2 shrink-0 rounded-sm"
				style={{ background: color }}
			/>
			<span className="min-w-0 truncate text-sm text-foreground">
				{featureName}
			</span>
		</span>
		<span
			className="min-w-0 truncate text-tiny-id text-tertiary-foreground"
			title={event.customer_id}
		>
			{event.customer_id}
		</span>
		<span className={cn(VALUE_CELL, "text-sm text-foreground")}>
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
	selectedId,
	onSelect,
}: {
	events: ApiEventsListItem[];
	isLoading: boolean;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	fetchNextPage: () => void;
	selectedId: string | null;
	onSelect: (event: ApiEventsListItem) => void;
}) => {
	const { colorFor, nameFor } = useLogFeatures();
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
							<LogsSkeletonRow key={i} index={i} />
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
										color={colorFor(event.feature_id)}
										isSelected={event.id === selectedId}
										top={item.start}
										onSelect={() => onSelect(event)}
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
