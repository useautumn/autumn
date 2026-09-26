import {
	type ReactNode,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import {
	formatCompactNumber,
	formatPeriodLabel,
} from "../utils/parseTimestamp";
import { isOtherSeries } from "../utils/seriesColors";
import type { ChartSeriesConfig } from "../utils/transformGroupedChartData";
import type { EventsData } from "./analytics-types";
import { SeriesNameHoverCard } from "./SeriesNameHoverCard";

const HEADER_ROW = "flex items-center h-8 border-b bg-interactive-secondary";
const SERIES_ROW = "flex items-center h-11 border-b bg-background";
const TOTAL_ROW = "flex items-center h-11 bg-interactive-secondary";
const PERIOD_CELL = "w-[88px] shrink-0 px-3 text-right tabular-nums";
const PINNED_LEFT_SHADOW = "shadow-[6px_0_8px_-4px_rgba(0,0,0,0.18)]";
const PINNED_RIGHT_SHADOW = "shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.18)]";
const DASH = "—";

interface TableCell {
	text: string;
	title?: string;
}

interface TableRow {
	key: string;
	name: ReactNode;
	cells: TableCell[];
	total: TableCell;
}

/** Everything the table renders, whether from real data or a loading placeholder. */
interface TableModel {
	periodLabels: string[];
	seriesRows: TableRow[];
	totalRow: Omit<TableRow, "key" | "name">;
	isPlaceholder: boolean;
}

/** The table's shape before any data arrives; every cell renders as a dash. */
export interface TablePlaceholder {
	rowCount: number;
	periodLabels: string[];
}

/** Largest series first, matching the legend; the catch-all bucket goes last. */
const orderSeriesForTable = ({
	chartConfig,
}: {
	chartConfig: ChartSeriesConfig[];
}) => {
	// Chart order stacks the largest last, so reverse it for reading top-down.
	const largestFirst = [...chartConfig].reverse();
	return [
		...largestFirst.filter((series) => !isOtherSeries({ key: series.yKey })),
		...largestFirst.filter((series) => isOtherSeries({ key: series.yKey })),
	];
};

/** Grouped series read group-first on two lines; plain series keep one line. */
const SeriesName = ({ series }: { series: ChartSeriesConfig }) => {
	if (!series.nameParts) {
		return (
			<span className="block truncate text-foreground" title={series.yName}>
				{series.yName}
			</span>
		);
	}
	return (
		<span className="flex min-w-0 flex-col leading-tight" title={series.yName}>
			<span className="truncate text-foreground">{series.nameParts.group}</span>
			<span className="truncate text-xs text-tertiary-foreground">
				{series.nameParts.feature}
			</span>
		</span>
	);
};

const numberCell = (value: number): TableCell => ({
	text: formatCompactNumber(value),
	title: value.toLocaleString(),
});

const placeholderToModel = ({
	placeholder,
}: {
	placeholder: TablePlaceholder;
}): TableModel => {
	const dashes = placeholder.periodLabels.map(() => ({ text: DASH }));
	return {
		periodLabels: placeholder.periodLabels,
		seriesRows: Array.from({ length: placeholder.rowCount }, (_, index) => ({
			key: String(index),
			name: <span className="text-placeholder">{DASH}</span>,
			cells: dashes,
			total: { text: DASH },
		})),
		totalRow: { cells: dashes, total: { text: DASH } },
		isPlaceholder: true,
	};
};

const chartDataToModel = ({
	chartData,
	chartConfig,
	interval,
}: {
	chartData: EventsData;
	chartConfig: ChartSeriesConfig[];
	interval: string | null;
}): TableModel => {
	const rows = chartData.data;
	const series = orderSeriesForTable({ chartConfig });
	const valueAt = (rowIndex: number, key: string) =>
		Number(rows[rowIndex][key] ?? 0);

	const seriesRows = series.map((s) => {
		const values = rows.map((_, rowIndex) => valueAt(rowIndex, s.yKey));
		return {
			key: s.yKey,
			name: (
				<>
					<span
						className="size-2.5 shrink-0 rounded-[3px]"
						style={{ background: s.fill }}
					/>
					<SeriesNameHoverCard series={s}>
						<SeriesName series={s} />
					</SeriesNameHoverCard>
				</>
			),
			cells: values.map(numberCell),
			total: numberCell(values.reduce((sum, value) => sum + value, 0)),
		};
	});

	const periodTotals = rows.map((_, rowIndex) =>
		series.reduce((sum, s) => sum + valueAt(rowIndex, s.yKey), 0),
	);

	return {
		periodLabels: rows.map((row) =>
			formatPeriodLabel({ period: String(row.period), interval }),
		),
		seriesRows,
		totalRow: {
			cells: periodTotals.map(numberCell),
			total: numberCell(periodTotals.reduce((sum, value) => sum + value, 0)),
		},
		isPlaceholder: false,
	};
};

/** Whether columns are scrolled out of view on either side of the pinned columns. */
const useHiddenColumnEdges = ({ resetKey }: { resetKey: string }) => {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [edges, setEdges] = useState({ left: false, right: false });

	const updateEdges = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		const maxScroll = el.scrollWidth - el.clientWidth;
		setEdges({ left: el.scrollLeft > 0, right: el.scrollLeft < maxScroll - 1 });
	}, []);

	// Open on the latest bins, the ones people check first; resetKey marks a new column set.
	useLayoutEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollLeft = el.scrollWidth;
		updateEdges();
	}, [resetKey, updateEdges]);

	return { scrollRef, edges, updateEdges };
};

/** The chart's data as a table: one row per series, one column per bin. */
export const UsageBreakdownTable = ({
	chartData,
	chartConfig,
	interval,
	nameHeader,
	isLoading,
	placeholder,
}: {
	chartData: EventsData | null;
	chartConfig: ChartSeriesConfig[] | null;
	interval: string | null;
	nameHeader: string;
	isLoading: boolean;
	placeholder: TablePlaceholder | null;
}) => {
	const model = useMemo(() => {
		if (isLoading) {
			return placeholder ? placeholderToModel({ placeholder }) : null;
		}
		if (!chartData?.data.length || !chartConfig?.length) return null;
		return chartDataToModel({ chartData, chartConfig, interval });
	}, [isLoading, placeholder, chartData, chartConfig, interval]);

	const { scrollRef, edges, updateEdges } = useHiddenColumnEdges({
		resetKey: `${model?.isPlaceholder}:${model?.periodLabels.join()}:${model?.seriesRows.length}`,
	});

	if (!model) return null;

	const valueTone = model.isPlaceholder
		? "text-placeholder"
		: "text-muted-foreground";
	const totalTone = model.isPlaceholder
		? "text-placeholder"
		: "font-semibold text-foreground tabular-nums";

	return (
		<div className="flex rounded-lg border overflow-hidden bg-background text-[13px]">
			{/* Pinned name column: sits above the scroller so its shadow falls on the numbers. */}
			<div
				className={cn(
					"relative z-10 w-[220px] shrink-0 border-r bg-background transition-shadow",
					edges.left && PINNED_LEFT_SHADOW,
				)}
			>
				<div className={cn(HEADER_ROW, "pl-4 text-xs font-medium text-subtle")}>
					{nameHeader}
				</div>
				{model.seriesRows.map((row) => (
					<div key={row.key} className={cn(SERIES_ROW, "gap-2.5 pl-4 pr-3")}>
						{row.name}
					</div>
				))}
				{/* Indented to line up with series names, past the colour swatch. */}
				<div className={cn(TOTAL_ROW, "pl-9 text-tertiary-foreground")}>
					Total
				</div>
			</div>

			<div
				ref={scrollRef}
				onScroll={updateEdges}
				className="min-w-0 flex-1 overflow-x-auto"
			>
				<div className="flex flex-col w-max min-w-full">
					<div
						className={cn(
							HEADER_ROW,
							"justify-end text-xs font-medium text-subtle",
						)}
					>
						{model.periodLabels.map((label, index) => (
							<span key={index} className={PERIOD_CELL}>
								{label}
							</span>
						))}
					</div>
					{model.seriesRows.map((row) => (
						<div key={row.key} className={cn(SERIES_ROW, "justify-end")}>
							{row.cells.map((cell, index) => (
								<span
									key={index}
									className={cn(PERIOD_CELL, valueTone)}
									title={cell.title}
								>
									{cell.text}
								</span>
							))}
						</div>
					))}
					<div
						className={cn(
							TOTAL_ROW,
							"justify-end",
							model.isPlaceholder
								? "text-placeholder"
								: "text-tertiary-foreground",
						)}
					>
						{model.totalRow.cells.map((cell, index) => (
							<span key={index} className={PERIOD_CELL} title={cell.title}>
								{cell.text}
							</span>
						))}
					</div>
				</div>
			</div>

			<div
				className={cn(
					"relative z-10 w-[112px] shrink-0 border-l bg-background transition-shadow",
					edges.right && PINNED_RIGHT_SHADOW,
				)}
			>
				<div
					className={cn(
						HEADER_ROW,
						"justify-end pr-4 text-xs font-medium text-tertiary-foreground",
					)}
				>
					Total
				</div>
				{model.seriesRows.map((row) => (
					<div
						key={row.key}
						className={cn(SERIES_ROW, "justify-end pr-4", totalTone)}
						title={row.total.title}
					>
						{row.total.text}
					</div>
				))}
				<div
					className={cn(TOTAL_ROW, "justify-end pr-4", totalTone)}
					title={model.totalRow.total.title}
				>
					{model.totalRow.total.text}
				</div>
			</div>
		</div>
	);
};
