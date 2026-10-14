import { Skeleton } from "@autumn/ui";
import {
	PLAN_SECTION_HEADER_CLASS,
	PlanSection,
} from "@/components/forms/customer-state/components/tray/PlanSection";
import { cn } from "@/lib/utils";
import type { SkeletonScope } from "../../utils/review/formPhasesToSkeletonPhases";
import { ReviewScopeHeader } from "./ReviewScopeHeader";
import {
	pickWidth,
	REVIEW_ROW_CLASS,
	REVIEW_STATUS_COLUMN_CLASS,
	REVIEW_VALUE_COLUMN_CLASS,
} from "./reviewColumns";

const NAME_WIDTHS = ["w-2/5", "w-1/2", "w-1/3", "w-[45%]"];
const CHIP_WIDTHS = ["w-[68px]", "w-[84px]", "w-[60px]"];
const VALUE_WIDTHS = ["w-16", "w-12", "w-14"];

/** One plan row's columns, matching ReviewChangeRowItem: name, status chip, value. */
function SkeletonPlanRow({ index }: { index: number }) {
	return (
		<div className={REVIEW_ROW_CLASS}>
			<span className="flex min-w-0 flex-1">
				<Skeleton
					className={cn(
						"h-3.5 rounded-sm",
						pickWidth({ widths: NAME_WIDTHS, index }),
					)}
				/>
			</span>
			<span className={REVIEW_STATUS_COLUMN_CLASS}>
				<Skeleton
					className={cn(
						"h-[22px] rounded-md",
						pickWidth({ widths: CHIP_WIDTHS, index }),
					)}
				/>
			</span>
			<span className={cn(REVIEW_VALUE_COLUMN_CLASS, "justify-end")}>
				<Skeleton
					className={cn(
						"h-3.5 rounded-sm",
						pickWidth({ widths: VALUE_WIDTHS, index }),
					)}
				/>
			</span>
		</div>
	);
}

/** Phase blocks shaped like the form's phases and scopes, held while a preview loads. */
export function ReviewChangeSkeletonPhases({
	phases,
}: {
	phases: SkeletonScope[][];
}) {
	const showsScopes = phases.some((scopes) =>
		scopes.some((scope) => scope.entityId),
	);

	return (
		<div className="flex flex-col gap-4">
			{phases.map((scopes, phaseIndex) => (
				<PlanSection
					key={phaseIndex}
					header={
						<div className={PLAN_SECTION_HEADER_CLASS}>
							<Skeleton className="h-3.5 w-24 rounded-sm" />
						</div>
					}
				>
					{scopes.map(({ entityId, rowCount }, scopeIndex) => (
						<div key={entityId ?? `customer-${scopeIndex}`}>
							{showsScopes && <ReviewScopeHeader entityId={entityId} />}
							{Array.from({ length: rowCount }, (_, rowIndex) => (
								<SkeletonPlanRow key={rowIndex} index={scopeIndex + rowIndex} />
							))}
						</div>
					))}
				</PlanSection>
			))}
		</div>
	);
}
