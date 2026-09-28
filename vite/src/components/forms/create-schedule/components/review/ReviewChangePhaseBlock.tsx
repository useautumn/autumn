import { PlanSection } from "@/components/forms/customer-state/components/tray/PlanSection";
import { PlanTraySectionTitle } from "@/components/forms/customer-state/components/tray/PlanTraySectionTitle";
import type { ReviewChangePhase } from "../../utils/review/types/reviewChange";
import { ReviewChangeRowItem } from "./ReviewChangeRowItem";

export function ReviewChangePhaseBlock({
	phase,
	showsStatus,
}: {
	phase: ReviewChangePhase;
	showsStatus: boolean;
}) {
	return (
		<PlanSection header={<PlanTraySectionTitle title={phase.label} />}>
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
