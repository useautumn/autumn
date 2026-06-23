import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/utils";
import type { ColumnSkeletonMeta } from "./table-row-cells";

const LABEL_WIDTHS = ["w-12", "w-16", "w-14", "w-10", "w-20", "w-14"];
const DATE_WIDTHS = ["w-28", "w-32", "w-30", "w-26", "w-34", "w-28"];
const ID_WIDTHS = ["w-28", "w-36", "w-32", "w-24", "w-40", "w-30"];
const NAME_WIDTHS = ["w-20", "w-24", "w-16", "w-28", "w-20", "w-24"];

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
