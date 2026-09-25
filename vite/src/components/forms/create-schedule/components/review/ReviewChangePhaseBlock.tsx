import type { ReviewChangePhase } from "../../utils/review/types/reviewChange";
import { ReviewChangeRowItem } from "./ReviewChangeRowItem";

export function ReviewChangePhaseBlock({
	phase,
}: {
	phase: ReviewChangePhase;
}) {
	return (
		<div className="flex flex-col">
			<div className="flex items-center gap-2 pt-0.5 pb-1">
				<span className="text-xs font-medium text-tertiary-foreground">
					{phase.label}
				</span>
				<span className="h-px flex-1 bg-border/60" />
				{phase.total && (
					<span className="text-xs font-medium tabular-nums text-subtle">
						{phase.total}
					</span>
				)}
			</div>
			{phase.rows.map((row) => (
				<ReviewChangeRowItem key={row.key} row={row} />
			))}
		</div>
	);
}
