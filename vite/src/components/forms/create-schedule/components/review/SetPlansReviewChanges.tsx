import { Accordion } from "@autumn/ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { useCreateScheduleFormContext } from "../../context/CreateScheduleFormProvider";
import { useSetPlansReviewSections } from "../../hooks/useSetPlansReviewSections";
import { ReviewChangeGroup } from "./ReviewChangeGroup";
import { ReviewWarnings } from "./ReviewWarnings";

const DEFAULT_OPEN_GROUPS = ["plans"];

export function SetPlansReviewChanges() {
	const { isPreviewLoading } = useCreateScheduleFormContext();
	const sections = useSetPlansReviewSections();
	if (!sections) return null;

	const { warnings, plans, balances, processor } = sections;
	const groups: ComponentProps<typeof ReviewChangeGroup>[] = [
		{ value: "plans", system: "autumn", title: "Plans", section: plans },
		{
			value: "balances",
			system: "autumn",
			title: "Balances",
			section: balances,
		},
		{
			value: "subscription",
			system: "stripe",
			title: "Subscription",
			section: processor,
		},
	];
	const visibleGroups = groups.filter(
		({ section }) =>
			section === plans ||
			section.phases.length > 0 ||
			Boolean(section.stripeIds?.length),
	);

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
				{visibleGroups.map((group) => (
					<ReviewChangeGroup key={group.value} {...group} />
				))}
			</Accordion>
		</div>
	);
}
