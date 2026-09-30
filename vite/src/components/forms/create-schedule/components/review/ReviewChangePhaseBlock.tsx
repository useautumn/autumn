import { StatusChip } from "@autumn/ui";
import {
	PLAN_SECTION_HEADER_CLASS,
	PlanSection,
} from "@/components/forms/customer-state/components/tray/PlanSection";
import { PlanTraySectionTitle } from "@/components/forms/customer-state/components/tray/PlanTraySectionTitle";
import type { ReviewChangePhase } from "../../utils/review/types/reviewChange";
import { ReviewChangeRowGroup } from "./ReviewChangeRowGroup";
import { ReviewChangeRowItem } from "./ReviewChangeRowItem";

function RemovedPhaseTitle({ label }: { label: string }) {
	return (
		<div className={PLAN_SECTION_HEADER_CLASS}>
			<span className="font-medium text-tertiary-foreground line-through">
				{label}
			</span>
			<StatusChip tone="red" glyph="x">
				Phase removed
			</StatusChip>
		</div>
	);
}

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
				phase.removed ? (
					<RemovedPhaseTitle label={phase.label} />
				) : (
					<PlanTraySectionTitle title={phase.label} />
				)
			}
			surfaceClassName={phase.removed ? "border-dashed opacity-80" : undefined}
		>
			{phase.rows.map((row) =>
				row.items ? (
					<ReviewChangeRowGroup
						key={row.key}
						row={row}
						items={row.items}
						showsStatus={showsStatus}
					/>
				) : (
					<ReviewChangeRowItem
						key={row.key}
						row={row}
						showsStatus={showsStatus}
					/>
				),
			)}
		</PlanSection>
	);
}
