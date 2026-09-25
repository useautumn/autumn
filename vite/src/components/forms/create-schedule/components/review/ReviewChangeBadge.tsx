import { cn } from "@/lib/utils";
import type { ReviewChangeTone } from "../../utils/review/types/reviewChange";

const TONE_CLASS: Record<ReviewChangeTone, string> = {
	new: "bg-emerald-500/10 border-emerald-500/20 text-emerald-500",
	ending: "bg-red-500/10 border-red-500/20 text-red-500",
	kept: "bg-muted border-border/50 text-tertiary-foreground",
	changed: "bg-amber-500/10 border-amber-500/20 text-amber-500",
	processor: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400",
};

export function ReviewChangeBadge({
	tone,
	label,
}: {
	tone: ReviewChangeTone;
	label: string;
}) {
	return (
		<span
			className={cn(
				"shrink-0 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-3.5",
				TONE_CLASS[tone],
			)}
		>
			{label}
		</span>
	);
}
