import { StatusChip } from "@autumn/ui";
import { Fragment } from "react";
import {
	PLAN_SECTION_HEADER_CLASS,
	PlanSection,
} from "@/components/forms/customer-state/components/tray/PlanSection";
import { PlanTraySectionTitle } from "@/components/forms/customer-state/components/tray/PlanTraySectionTitle";
import { groupRowsByScope } from "../../utils/review/groupRowsByScope";
import type {
	ReviewChangePhase,
	ReviewChangeRow,
} from "../../utils/review/types/reviewChange";
import { ReviewChangeRowGroup } from "./ReviewChangeRowGroup";
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

function ReviewChangeRowEntry({
	row,
	showsStatus,
}: {
	row: ReviewChangeRow;
	showsStatus: boolean;
}) {
	return row.items ? (
		<ReviewChangeRowGroup
			row={row}
			items={row.items}
			showsStatus={showsStatus}
		/>
	) : (
		<ReviewChangeRowItem row={row} showsStatus={showsStatus} />
	);
}

export function ReviewChangePhaseBlock({
	phase,
	showsStatus,
	showsScopes,
}: {
	phase: ReviewChangePhase;
	showsStatus: boolean;
	showsScopes: boolean;
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
			surfaceClassName={phase.removed ? "border-dashed" : undefined}
		>
			{showsScopes
				? groupRowsByScope({ rows: phase.rows }).map(({ entityId, rows }) => (
						<Fragment key={entityId ?? "customer"}>
							<ReviewScopeHeader entityId={entityId} />
							{rows.map((row) => (
								<ReviewChangeRowEntry
									key={row.key}
									row={row}
									showsStatus={showsStatus}
								/>
							))}
						</Fragment>
					))
				: phase.rows.map((row) => (
						<ReviewChangeRowEntry
							key={row.key}
							row={row}
							showsStatus={showsStatus}
						/>
					))}
		</PlanSection>
	);
}
