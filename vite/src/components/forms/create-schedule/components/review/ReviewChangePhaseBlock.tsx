import type { SetPlansReviewPhase } from "@autumn/shared";
import { StatusChip } from "@autumn/ui";
import { Fragment } from "react";
import {
	PLAN_SECTION_HEADER_CLASS,
	PlanSection,
} from "@/components/forms/customer-state/components/tray/PlanSection";
import { PlanTraySectionTitle } from "@/components/forms/customer-state/components/tray/PlanTraySectionTitle";
import { formatReviewText } from "../../utils/review/formatReviewText";
import { groupRowsByScope } from "../../utils/review/groupRowsByScope";
import { ReviewChangeRowItem } from "./ReviewChangeRowItem";
import { ReviewScopeHeader } from "./ReviewScopeHeader";

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
	showsScopes,
}: {
	phase: SetPlansReviewPhase;
	showsStatus: boolean;
	showsScopes: boolean;
}) {
	return (
		<PlanSection
			header={
				phase.removed ? (
					<RemovedPhaseTitle label={formatReviewText(phase.label)} />
				) : (
					<PlanTraySectionTitle title={formatReviewText(phase.label)} />
				)
			}
			surfaceClassName={phase.removed ? "border-dashed" : undefined}
		>
			{showsScopes
				? groupRowsByScope({ rows: phase.rows }).map(({ entityId, rows }) => (
						<Fragment
							key={entityId === null ? "customer" : `entity:${entityId}`}
						>
							<ReviewScopeHeader entityId={entityId} />
							{rows.map((row) => (
								<ReviewChangeRowItem
									key={row.key}
									row={row}
									showsStatus={showsStatus}
								/>
							))}
						</Fragment>
					))
				: phase.rows.map((row) => (
						<ReviewChangeRowItem
							key={row.key}
							row={row}
							showsStatus={showsStatus}
						/>
					))}
		</PlanSection>
	);
}
