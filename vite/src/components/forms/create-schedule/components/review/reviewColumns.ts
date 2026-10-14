import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";

export const REVIEW_ROW_CLASS = cn(
	"flex min-h-11 items-center gap-3 px-3 py-[7px]",
	TABLE_TRAY_SURFACE_DIVIDER_CLASS,
);
export const REVIEW_STATUS_COLUMN_CLASS = "w-[108px] shrink-0";
export const REVIEW_VALUE_COLUMN_MIN_WIDTH_PX = 104;
export const REVIEW_VALUE_COLUMN_CLASS = "flex min-w-[104px] shrink-0";

/** Skeleton widths that vary by row, so placeholders don't look stamped. */
export const pickWidth = ({
	widths,
	index,
}: {
	widths: string[];
	index: number;
}) => widths[index % widths.length];
