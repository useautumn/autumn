import type { ColumnSkeletonMeta } from "@autumn/ui/components/table/table-row-cells";
import { Skeleton } from "@autumn/ui/components/ui/skeleton";
import { cn } from "@autumn/ui/lib/utils";

// Percent widths never widen a column: they resolve against the cell, and
// count as zero in the auto table layout's min-content pass.
const LABEL_WIDTHS = [
	"w-1/2",
	"w-3/5",
	"w-[55%]",
	"w-2/5",
	"w-[70%]",
	"w-[55%]",
];
const DATE_WIDTHS = [
	"w-[70%]",
	"w-4/5",
	"w-3/4",
	"w-[65%]",
	"w-[85%]",
	"w-[70%]",
];
const ID_WIDTHS = [
	"w-[65%]",
	"w-[85%]",
	"w-3/4",
	"w-[55%]",
	"w-[95%]",
	"w-[70%]",
];
const NAME_WIDTHS = ["w-3/5", "w-[70%]", "w-1/2", "w-4/5", "w-3/5", "w-[70%]"];

const pickWidth = (widths: string[], rowIndex: number): string =>
	widths[rowIndex % widths.length];

export const nameWithIconSkeleton: ColumnSkeletonMeta = {
	skeleton: (rowIndex: number) => (
		<div className="flex items-center gap-2">
			<Skeleton className="size-4 rounded-sm shrink-0" />
			<Skeleton
				className={cn("h-3.5 rounded-sm", pickWidth(NAME_WIDTHS, rowIndex))}
			/>
		</div>
	),
};

export const statusSkeleton: ColumnSkeletonMeta = {
	skeleton: (rowIndex: number) => (
		<div className="flex items-center gap-1.5">
			<Skeleton
				className={cn("h-3.5 rounded-sm", pickWidth(LABEL_WIDTHS, rowIndex))}
			/>
			<Skeleton className="size-3.5 rounded-full shrink-0" />
		</div>
	),
};

export const dateSkeleton: ColumnSkeletonMeta = {
	skeleton: (rowIndex: number) => (
		<Skeleton
			className={cn("h-3.5 rounded-sm", pickWidth(DATE_WIDTHS, rowIndex))}
		/>
	),
};

export const idSkeleton: ColumnSkeletonMeta = {
	skeleton: (rowIndex: number) => (
		<Skeleton
			className={cn("h-3.5 rounded-sm", pickWidth(ID_WIDTHS, rowIndex))}
		/>
	),
};

export const hiddenSkeleton: ColumnSkeletonMeta = {
	hidden: true,
};
