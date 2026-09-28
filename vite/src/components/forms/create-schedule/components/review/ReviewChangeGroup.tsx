import { AccordionContent, AccordionItem, AccordionTrigger } from "@autumn/ui";
import { TABLE_TRAY_CLASS } from "@/components/general/table";
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
		<AccordionItem value={value} className="border-none">
			<AccordionTrigger className="h-[42px] items-center gap-[9px] rounded-none py-0 hover:no-underline [&>svg]:translate-y-0">
				<ReviewSystemMark system={system} />
				<span className="text-sm font-medium text-foreground">{title}</span>
				<ReviewStripeIdsPopover stripeIds={section.stripeIds} />
				<span className="flex-1" />
				<span className="text-xs font-normal text-tertiary-foreground">
					{section.summary}
				</span>
			</AccordionTrigger>
			<AccordionContent className="pb-4">
				<div className={TABLE_TRAY_CLASS}>
					{section.phases.map((phase) => (
						<ReviewChangePhaseBlock key={phase.key} phase={phase} />
					))}
				</div>
			</AccordionContent>
		</AccordionItem>
	);
}
