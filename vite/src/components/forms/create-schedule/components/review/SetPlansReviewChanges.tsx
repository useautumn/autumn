import type { SetPlansPreviewReview } from "@autumn/shared";
import { Accordion } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { useCreateScheduleFormContext } from "../../context/CreateScheduleFormProvider";
import { useSetPlansReviewSections } from "../../hooks/useSetPlansReviewSections";
import { formPhasesToSkeletonPhases } from "../../utils/review/formPhasesToSkeletonPhases";
import type {
	ReviewGroupLayout,
	ReviewGroupSystem,
} from "../../utils/review/types/reviewGroup";
import { ReviewChangeGroup } from "./ReviewChangeGroup";
import { ReviewWarnings } from "./ReviewWarnings";

const REVIEW_GROUPS: {
	value: keyof SetPlansPreviewReview;
	system: ReviewGroupSystem;
	title: string;
	layout?: ReviewGroupLayout;
}[] = [
	{ value: "plans", system: "autumn", title: "Plans" },
	{ value: "balances", system: "autumn", title: "Balances" },
	{
		value: "subscription",
		system: "stripe",
		title: "Subscription",
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
			{sections && !sections.review ? (
				<p className="px-4 py-3 text-xs text-tertiary-foreground">
					The plan changes can't be shown yet. Refresh the page to load them.
				</p>
			) : (
				<Accordion type="multiple" className="px-4 pt-1">
					{REVIEW_GROUPS.map((group) => (
						<ReviewChangeGroup
							key={group.value}
							{...group}
							section={sections?.review?.[group.value]}
							placeholderPhases={
								group.value === "balances" ? undefined : placeholderPhases
							}
						/>
					))}
				</Accordion>
			)}
		</div>
	);
}
