import { cn } from "@/lib/utils";
import { isMovedQuantity } from "../../utils/review/quantityChange";
import type {
	ReviewChangeRow,
	ReviewChangeTone,
} from "../../utils/review/types/reviewChange";
import { ReviewQuantityChangeLine } from "./ReviewQuantityChangeLine";
import { ReviewQuantityValue } from "./ReviewQuantityValue";

const TONE_BAR_CLASS: Record<ReviewChangeTone, string> = {
	new: "bg-emerald-500",
	ending: "bg-red-500",
	kept: "bg-subtle/40",
	changed: "bg-amber-500",
};

export function ReviewChangeRowItem({ row }: { row: ReviewChangeRow }) {
	const isEnding = row.tone === "ending";

	return (
		<div className="relative flex min-h-9 items-center gap-2.5 py-1 pl-3">
			{row.tone && (
				<span
					className={cn(
						"absolute inset-y-1.5 left-0 w-0.5 rounded-full",
						TONE_BAR_CLASS[row.tone],
					)}
				/>
			)}
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex min-w-0 items-center gap-1.5">
					<span
						className={cn(
							"truncate text-sm font-medium",
							isEnding ? "text-subtle" : "text-muted-foreground",
						)}
					>
						{row.title}
					</span>
					{row.flag && (
						<span className="shrink-0 rounded-[4px] bg-amber-500/10 px-1.5 text-[11px] font-medium leading-[18px] text-amber-500">
							{row.flag}
						</span>
					)}
				</div>
				{isMovedQuantity(row.quantity) ? (
					<ReviewQuantityChangeLine quantity={row.quantity} />
				) : (
					row.description && (
						<span className="truncate text-xs text-subtle">
							{row.description}
						</span>
					)
				)}
			</div>
			<div className="flex max-w-[140px] shrink-0 flex-col items-end">
				{row.value && (
					<span className="flex items-baseline gap-0.5 whitespace-nowrap">
						<span className="text-sm font-medium tabular-nums text-muted-foreground">
							{row.value.amount}
						</span>
						{row.value.suffix && (
							<span className="text-xs text-subtle">{row.value.suffix}</span>
						)}
					</span>
				)}
				{row.quantity && <ReviewQuantityValue quantity={row.quantity} />}
			</div>
		</div>
	);
}
