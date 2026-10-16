import { InfoTooltip, Skeleton } from "@autumn/ui";
import { TABLE_TRAY_SURFACE_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import {
	ATOM_PAGE_CARD_CLASS,
	ATOM_PAGE_CARD_SURFACE_CELL_CLASS,
	ATOM_PAGE_CARD_TRAY_ROW_CLASS,
} from "../atomCardLayout";
import { formatMetricsTimestamp } from "./atomMetricsFormat";

const ChartArea = ({
	isLoading,
	isEmpty,
	emptyLabel,
	children,
}: {
	isLoading: boolean;
	isEmpty: boolean;
	emptyLabel: string;
	children: React.ReactNode;
}) => {
	if (isLoading) return <Skeleton className="size-full" />;
	if (isEmpty)
		return (
			<div className="flex size-full items-center justify-center text-sm text-tertiary-foreground">
				{emptyLabel}
			</div>
		);
	return children;
};

/** A monitoring chart on the tray: what it shows and when it last read (or an action) above, its latest readings, plot and footer on the surface. */
export const MonitoringChartCard = ({
	title,
	info,
	description,
	readingAt,
	action,
	summary,
	footer,
	isLoading,
	isEmpty,
	emptyLabel = "No data yet",
	isEmptyCompact = false,
	plotClassName = "h-44",
	children,
}: {
	title: string;
	/** Explains the card behind an info icon beside its title. */
	info?: React.ReactNode;
	description?: string;
	readingAt?: number;
	/** Takes the reading's place at the right of the title row. */
	action?: React.ReactNode;
	summary: React.ReactNode;
	footer?: React.ReactNode;
	isLoading: boolean;
	isEmpty: boolean;
	emptyLabel?: string;
	/** With no data, one line in place of the summary and plot. */
	isEmptyCompact?: boolean;
	plotClassName?: string;
	children: React.ReactNode;
}) => (
	<div className={ATOM_PAGE_CARD_CLASS}>
		<div
			className={cn(
				"flex h-9 items-center gap-2 text-sm",
				ATOM_PAGE_CARD_TRAY_ROW_CLASS,
			)}
		>
			<span className="shrink-0 font-medium text-foreground">{title}</span>
			{info && <InfoTooltip side="top">{info}</InfoTooltip>}
			{description && (
				<span className="truncate text-tertiary-foreground">{description}</span>
			)}
			{action && <span className="ml-auto shrink-0">{action}</span>}
			{!action && readingAt !== undefined && (
				<span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-xs text-subtle">
					<span className="size-1.5 rounded-full bg-green-500" />
					{formatMetricsTimestamp(readingAt)}
				</span>
			)}
		</div>
		<div
			className={cn(
				TABLE_TRAY_SURFACE_CLASS,
				"flex flex-col gap-3 py-4",
				ATOM_PAGE_CARD_SURFACE_CELL_CLASS,
			)}
		>
			{isEmptyCompact && isEmpty && !isLoading ? (
				<span className="text-sm text-tertiary-foreground">{emptyLabel}</span>
			) : (
				<>
					{summary}
					<div className={plotClassName}>
						<ChartArea
							isLoading={isLoading}
							isEmpty={isEmpty}
							emptyLabel={emptyLabel}
						>
							{children}
						</ChartArea>
					</div>
					{footer}
				</>
			)}
		</div>
	</div>
);
