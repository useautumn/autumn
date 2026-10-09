import { Skeleton } from "@autumn/ui";
import { TABLE_TRAY_SURFACE_ROW_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import { ROW_GRID, ROW_HEIGHT } from "./logsListGrid";

// Varied widths so the placeholder reads like real rows, not a uniform grid.
const SKELETON_WIDTHS = {
	event: ["w-24", "w-16", "w-20", "w-28"],
	customer: ["w-20", "w-16", "w-24", "w-14"],
	properties: ["w-56", "w-40", "w-64", "w-32"],
};

const pickWidth = (widths: string[], index: number) =>
	widths[index % widths.length];

export const LogsSkeletonRow = ({ index }: { index: number }) => (
	<div
		style={{ ...ROW_GRID, height: ROW_HEIGHT }}
		className={cn("px-4", TABLE_TRAY_SURFACE_ROW_CLASS)}
	>
		<Skeleton className="h-3 w-24 rounded-sm" />
		<Skeleton
			className={cn(
				"h-[22px] rounded-md",
				pickWidth(SKELETON_WIDTHS.event, index),
			)}
		/>
		<Skeleton
			className={cn(
				"h-3 rounded-sm",
				pickWidth(SKELETON_WIDTHS.customer, index + 1),
			)}
		/>
		<Skeleton className="ml-auto h-3 w-5 rounded-sm" />
		<span className="pl-4">
			<Skeleton
				className={cn(
					"h-3 max-w-full rounded-sm",
					pickWidth(SKELETON_WIDTHS.properties, index + 2),
				)}
			/>
		</span>
	</div>
);
