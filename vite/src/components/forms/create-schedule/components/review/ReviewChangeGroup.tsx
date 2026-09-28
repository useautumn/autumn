import { AccordionContent, AccordionItem, AccordionTrigger } from "@autumn/ui";
import { cn } from "@/lib/utils";
import type {
	ReviewChangeSection,
	ReviewChangeSystem,
} from "../../utils/review/types/reviewChange";
import {
	REVIEW_PHASE_LIST_CLASS,
	ReviewChangePhaseBlock,
} from "./ReviewChangePhaseBlock";
import { ReviewGroupTitle } from "./ReviewGroupTitle";
import { ReviewStripeIdsPopover } from "./ReviewStripeIdsPopover";

export const REVIEW_GROUP_HEADER_CLASS = "h-[42px] items-center gap-[9px]";

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
	const showsStatus = section.phases.some((phase) =>
		phase.rows.some((row) => row.status),
	);

	return (
		<AccordionItem value={value} className="border-none">
			<AccordionTrigger
				className={cn(
					REVIEW_GROUP_HEADER_CLASS,
					"rounded-none py-0 hover:no-underline [&>svg]:translate-y-0",
				)}
			>
				<ReviewGroupTitle system={system} title={title} />
				<ReviewStripeIdsPopover stripeIds={section.stripeIds} />
				<span className="flex-1" />
				<span className="text-xs font-normal text-tertiary-foreground">
					{section.summary}
				</span>
			</AccordionTrigger>
			<AccordionContent className="pb-4">
				<div className={REVIEW_PHASE_LIST_CLASS}>
					{section.phases.map((phase) => (
						<ReviewChangePhaseBlock
							key={phase.key}
							phase={phase}
							showsStatus={showsStatus}
						/>
					))}
				</div>
			</AccordionContent>
		</AccordionItem>
	);
}
