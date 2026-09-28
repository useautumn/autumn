import { TABLE_TRAY_SURFACE_CLASS } from "@/components/general/table";
import type { ReviewChangePhase } from "../../utils/review/types/reviewChange";
import { ReviewChangeRowItem } from "./ReviewChangeRowItem";

export function ReviewChangePhaseBlock({
	phase,
}: {
	phase: ReviewChangePhase;
}) {
	return (
		<div className="flex flex-col">
			<div className="flex items-center justify-between px-2 pt-2 pb-1.5 text-xs">
				<span className="font-medium text-muted-foreground">{phase.label}</span>
				{phase.total && (
					<span className="tabular-nums text-tertiary-foreground">
						{phase.total}
					</span>
				)}
			</div>
			<div className={TABLE_TRAY_SURFACE_CLASS}>
				{phase.rows.map((row) => (
					<ReviewChangeRowItem key={row.key} row={row} />
				))}
			</div>
		</div>
	);
}
