import { Accordion } from "@autumn/ui";
import { cn } from "@/lib/utils";
import { useCreateScheduleFormContext } from "../../context/CreateScheduleFormProvider";
import { useSetPlansReviewSections } from "../../hooks/useSetPlansReviewSections";
import type { ReviewChangeSection } from "../../utils/review/types/reviewChange";
import { ReviewChangeGroup } from "./ReviewChangeGroup";
import { ReviewChangesSkeleton } from "./ReviewChangesSkeleton";
import { ReviewWarnings } from "./ReviewWarnings";
import {
	DEFAULT_OPEN_REVIEW_GROUP,
	REVIEW_GROUPS,
	type ReviewGroupValue,
} from "./reviewGroups";

const DEFAULT_OPEN_GROUPS = [DEFAULT_OPEN_REVIEW_GROUP];

export function SetPlansReviewChanges() {
	const { isPreviewLoading } = useCreateScheduleFormContext();
	const sections = useSetPlansReviewSections();
	if (!sections) return isPreviewLoading ? <ReviewChangesSkeleton /> : null;

	const { warnings, plans, balances, processor } = sections;
	const groupSections: Record<ReviewGroupValue, ReviewChangeSection> = {
		plans,
		balances,
		subscription: processor,
	};
	const visibleGroups: Record<ReviewGroupValue, boolean> = {
		plans: true,
		balances: balances.phases.length > 0,
		subscription: processor.phases.length > 0 || processor.stripeIds.length > 0,
	};

	return (
		<div
			className={cn(
				"flex flex-col transition-opacity",
				isPreviewLoading && "opacity-60",
			)}
		>
			<ReviewWarnings warnings={warnings} />
			<Accordion
				type="multiple"
				defaultValue={DEFAULT_OPEN_GROUPS}
				className="px-4 pt-1"
			>
				{REVIEW_GROUPS.filter((group) => visibleGroups[group.value]).map(
					(group) => (
						<ReviewChangeGroup
							key={group.value}
							value={group.value}
							system={group.system}
							title={group.title}
							section={groupSections[group.value]}
						/>
					),
				)}
			</Accordion>
		</div>
	);
}
