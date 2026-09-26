import { cn } from "@/lib/utils";
import type { ReviewChangeRow } from "../../utils/review/types/reviewChange";
import { ReviewChangeBadge } from "./ReviewChangeBadge";
import { ReviewChangeIconGlyph } from "./ReviewChangeIconGlyph";

export function ReviewChangeRowItem({ row }: { row: ReviewChangeRow }) {
	return (
		<div className="flex min-h-7 items-center gap-2">
			<ReviewChangeIconGlyph icon={row.icon} isEnding={row.isEnding} />
			<div className="flex min-w-0 flex-1 flex-col">
				<span
					className={cn(
						"truncate text-sm font-medium",
						row.isEnding ? "text-subtle line-through" : "text-muted-foreground",
					)}
				>
					{row.title}
				</span>
				{row.detail && (
					<span className="truncate text-xs text-subtle">{row.detail}</span>
				)}
				{row.code && (
					<span className="truncate font-mono text-[11px] text-tertiary-foreground">
						{row.code}
					</span>
				)}
			</div>
			<ReviewChangeBadge tone={row.tone} label={row.label} />
			<span
				className={cn(
					"w-[72px] shrink-0 truncate text-right text-xs font-medium tabular-nums",
					row.isEnding ? "text-subtle" : "text-tertiary-foreground",
				)}
			>
				{row.value}
			</span>
		</div>
	);
}
