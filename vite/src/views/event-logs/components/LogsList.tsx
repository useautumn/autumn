import type { ApiEventsListItem } from "@autumn/shared";
import { Skeleton } from "@autumn/ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { type CSSProperties, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useLogFeatures } from "../hooks/useLogFeatures";
import { LogsIcon } from "../LogsIcon";

const ROW_HEIGHT = 34;
const LOADING_ROWS = 24;
/** Rows from the end at which the next page starts loading. */
const PREFETCH_THRESHOLD = 20;

/** One grid template for the header and every row, so columns always line up. */
const ROW_GRID: CSSProperties = {
	display: "grid",
	gridTemplateColumns:
		"150px minmax(0, 180px) minmax(0, 220px) 80px minmax(0, 1fr)",
	columnGap: "16px",
	alignItems: "center",
};

const CELL = "min-w-0 truncate";
const VALUE_CELL = "min-w-0 truncate text-right tabular-nums";
const PROPERTIES_CELL = "min-w-0 truncate pl-4";

export const formatLogTime = ({ timestamp }: { timestamp: number }) =>
	format(new Date(timestamp), "MMM d · HH:mm:ss");

const ColumnHeaders = () => (
	<div
		style={ROW_GRID}
		className="h-8 px-4 shrink-0 border-b bg-interactive-secondary text-xs font-medium text-subtle"
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
	color,
	isSelected,
	top,
	onSelect,
}: {
	event: ApiEventsListItem;
	color: string;
	isSelected: boolean;
	top: number;
	onSelect: () => void;
}) => {
	return (
		<button
			type="button"
			onClick={onSelect}
			style={{ ...ROW_GRID, top, height: ROW_HEIGHT }}
			className={cn(
				"absolute inset-x-0 px-4 text-left border-b border-border/60 hover:bg-muted/60",
				isSelected &&
					"bg-primary/10 hover:bg-primary/10 shadow-[inset_2px_0_0_var(--primary)]",
			)}
		>
			<span
				className={cn(
					CELL,
					"font-mono text-xs",
					isSelected ? "text-foreground" : "text-tertiary-foreground",
				)}
			>
				{formatLogTime({ timestamp: event.timestamp })}
			</span>
			<span className="flex items-center gap-2 min-w-0">
				<span
					className="size-2 shrink-0 rounded-sm"
					style={{ background: color }}
				/>
				<span className="min-w-0 truncate text-[13px] text-foreground">
					{event.feature_id}
				</span>
			</span>
			<span
				className={cn(CELL, "font-mono text-xs text-muted-foreground")}
				title={event.customer_id}
			>
				{event.customer_id}
			</span>
			<span className={cn(VALUE_CELL, "text-[13px] text-foreground")}>
				{event.value.toLocaleString()}
			</span>
			<span className={cn(PROPERTIES_CELL, "font-mono text-xs text-subtle")}>
				{JSON.stringify(event.properties ?? {})}
			</span>
		</button>
	);
};

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
	const { colorFor } = useLogFeatures();
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
		<div className="flex flex-col flex-1 min-w-0 min-h-0">
			<ColumnHeaders />
			{isEmpty ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
					<LogsIcon size={28} strokeWidth={1.5} className="opacity-50" />
					<p className="text-sm">No events match these filters.</p>
				</div>
			) : (
				<div
					ref={scrollRef}
					className={cn(
						"flex-1 min-h-0",
						isLoading ? "overflow-hidden" : "overflow-y-auto",
					)}
				>
					{isLoading ? (
						Array.from({ length: LOADING_ROWS }, (_, i) => (
							<div
								key={i}
								className="flex items-center gap-6 px-4 border-b border-border/60"
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
