import { Accordion } from "@autumn/ui";
import { useCreateScheduleFormContext } from "../../context/CreateScheduleFormProvider";
import { useSetPlansReviewSections } from "../../hooks/useSetPlansReviewSections";
import { formPhasesToSkeletonPhases } from "../../utils/review/formPhasesToSkeletonPhases";
import type {
	ReviewChangeLayout,
	ReviewChangeSystem,
} from "../../utils/review/types/reviewChange";
import { ReviewChangeGroup } from "./ReviewChangeGroup";
import { ReviewWarnings } from "./ReviewWarnings";

const REVIEW_GROUPS: {
	value: string;
	system: ReviewChangeSystem;
	title: string;
	sectionKey: "plans" | "balances" | "processor";
	layout?: ReviewChangeLayout;
}[] = [
	{ value: "plans", system: "autumn", title: "Plans", sectionKey: "plans" },
	{
		value: "balances",
		system: "autumn",
		title: "Balances",
		sectionKey: "balances",
	},
	{
		value: "subscription",
		system: "stripe",
		title: "Subscription",
		sectionKey: "processor",
		layout: "pricing_table",
	},
];

/** Every group always renders, as a skeleton whenever a preview is loading, so the
 * sheet never jumps and never shows a stale preview. */
export function SetPlansReviewChanges() {
	const { isPreviewLoading, formValues } = useCreateScheduleFormContext();
	const latestSections = useSetPlansReviewSections();
	const sections = isPreviewLoading ? undefined : latestSections;
	if (!sections && !isPreviewLoading) return null;

	const placeholderPhases = formPhasesToSkeletonPhases({
		phases: formValues.phases,
	});

	return (
		<div className="flex flex-col">
			{sections && <ReviewWarnings warnings={sections.warnings} />}
			<Accordion type="multiple" className="px-4 pt-1">
				{REVIEW_GROUPS.map(({ sectionKey, ...group }) => (
					<ReviewChangeGroup
						key={group.value}
						{...group}
						section={sections?.[sectionKey]}
						placeholderPhases={
							sectionKey === "balances" ? undefined : placeholderPhases
						}
					/>
				))}
			</Accordion>
		</div>
	);
}
