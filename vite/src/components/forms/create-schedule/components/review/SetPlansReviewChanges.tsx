import { Accordion } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
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

/** Skeletons hold the groups until the first preview; refetches dim the previous preview
 * in place so the banner and groups never collapse and re-expand. */
export function SetPlansReviewChanges() {
	const { isPreviewLoading, formValues } = useCreateScheduleFormContext();
	const sections = useSetPlansReviewSections();
	if (!sections && !isPreviewLoading) return null;

	const placeholderPhases = formPhasesToSkeletonPhases({
		phases: formValues.phases,
	});
	const isRefetching = Boolean(sections) && isPreviewLoading;

	return (
		<div
			aria-busy={isPreviewLoading}
			className={cn(
				"flex flex-col transition-opacity",
				isRefetching && "opacity-60",
			)}
		>
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
