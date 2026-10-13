import { Skeleton } from "@autumn/ui";
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
	children,
}: {
	isLoading: boolean;
	isEmpty: boolean;
	children: React.ReactNode;
}) => {
	if (isLoading) return <Skeleton className="size-full" />;
	if (isEmpty)
		return (
			<div className="flex size-full items-center justify-center text-sm text-tertiary-foreground">
				No data yet
			</div>
		);
	return children;
};

/** A monitoring chart on the tray: what it shows and when it last read above, its latest readings and plot on the surface. */
export const MonitoringChartCard = ({
	title,
	description,
	readingAt,
	summary,
	isLoading,
	isEmpty,
	children,
}: {
	title: string;
	description: string;
	readingAt?: number;
	summary: React.ReactNode;
	isLoading: boolean;
	isEmpty: boolean;
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
			<span className="truncate text-tertiary-foreground">{description}</span>
			{readingAt !== undefined && (
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
			{summary}
			<div className="h-44">
				<ChartArea isLoading={isLoading} isEmpty={isEmpty}>
					{children}
				</ChartArea>
			</div>
		</div>
	</div>
);
