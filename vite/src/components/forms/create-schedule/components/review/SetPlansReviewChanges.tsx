import { Accordion } from "@autumn/ui";
import { cn } from "@/lib/utils";
import { useCreateScheduleFormContext } from "../../context/CreateScheduleFormProvider";
import { useSetPlansReviewSections } from "../../hooks/useSetPlansReviewSections";
import type { ReviewChangeSystem } from "../../utils/review/types/reviewChange";
import { ReviewChangeGroup } from "./ReviewChangeGroup";
import { ReviewWarnings } from "./ReviewWarnings";

const REVIEW_GROUPS: {
	value: string;
	system: ReviewChangeSystem;
	title: string;
	sectionKey: "plans" | "balances" | "processor";
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
	},
];

const DEFAULT_OPEN_GROUPS = ["plans"];

/** Every group always renders, as a skeleton until the first preview lands, so the sheet never jumps. */
export function SetPlansReviewChanges() {
	const { isPreviewLoading, formValues } = useCreateScheduleFormContext();
	const sections = useSetPlansReviewSections();
	if (!sections && !isPreviewLoading) return null;

	const placeholderRowCounts = formValues.phases.map((phase) =>
		Math.max(phase.plans.length, 1),
	);

	return (
		<div
			className={cn(
				"flex flex-col transition-opacity",
				sections && isPreviewLoading && "opacity-60",
			)}
		>
			{sections && <ReviewWarnings warnings={sections.warnings} />}
			<Accordion
				type="multiple"
				defaultValue={DEFAULT_OPEN_GROUPS}
				className="px-4 pt-1"
			>
				{REVIEW_GROUPS.map(({ sectionKey, ...group }) => (
					<ReviewChangeGroup
						key={group.value}
						{...group}
						section={sections?.[sectionKey]}
						placeholderRowCounts={
							sectionKey === "plans" ? placeholderRowCounts : undefined
						}
					/>
				))}
			</Accordion>
		</div>
	);
}
