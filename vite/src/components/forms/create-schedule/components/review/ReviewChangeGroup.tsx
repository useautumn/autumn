import { AccordionContent, AccordionItem, AccordionTrigger } from "@autumn/ui";
import type { ReviewChangeSection } from "../../utils/review/types/reviewChange";
import { ReviewChangePhaseBlock } from "./ReviewChangePhaseBlock";
import { ReviewStripeIdsPopover } from "./ReviewStripeIdsPopover";
import { type ReviewChangeSystem, ReviewSystemMark } from "./ReviewSystemMark";

export function ReviewChangeGroup({
	value,
	system,
	title,
	section,
}: {
	value: string;
	system: ReviewChangeSystem;
	title: string;
	section: ReviewChangeSection;
}) {
	return (
		<AccordionItem value={value} className="border-b border-border">
			<AccordionTrigger className="h-11 items-center gap-2.5 rounded-none py-0 hover:no-underline [&>svg]:translate-y-0">
				<ReviewSystemMark system={system} />
				<span className="text-sm font-medium text-foreground">{title}</span>
				<ReviewStripeIdsPopover stripeIds={section.stripeIds} />
				<span className="flex-1" />
				<span className="text-xs font-normal text-subtle">
					{section.summary}
				</span>
			</AccordionTrigger>
			<AccordionContent className="flex flex-col gap-2 pb-3.5 pl-[18px]">
				{section.phases.map((phase) => (
					<ReviewChangePhaseBlock key={phase.key} phase={phase} />
				))}
			</AccordionContent>
		</AccordionItem>
	);
}
