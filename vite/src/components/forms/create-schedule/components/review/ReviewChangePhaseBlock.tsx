import {
	PLAN_SECTION_HEADER_CLASS,
	PlanSection,
} from "@/components/forms/customer-state/components/tray/PlanSection";
import { cn } from "@/lib/utils";
import type { ReviewChangePhase } from "../../utils/review/types/reviewChange";
import { ReviewChangeRowItem } from "./ReviewChangeRowItem";

export const REVIEW_PHASE_LIST_CLASS = "flex flex-col gap-4";

export const REVIEW_PHASE_HEADER_CLASS = cn(
	PLAN_SECTION_HEADER_CLASS,
	"justify-between",
);

export function ReviewChangePhaseBlock({
	phase,
	showsStatus,
}: {
	phase: ReviewChangePhase;
	showsStatus: boolean;
}) {
	return (
		<PlanSection
			header={
				<div className={REVIEW_PHASE_HEADER_CLASS}>
					<span className="font-medium text-muted-foreground">
						{phase.label}
					</span>
				</div>
			}
		>
			{phase.rows.map((row) => (
				<ReviewChangeRowItem
					key={row.key}
					row={row}
					showsStatus={showsStatus}
				/>
			))}
		</PlanSection>
	);
}
