import {
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import type {
	ReviewChangeSection,
	ReviewChangeSystem,
} from "../../utils/review/types/reviewChange";
import { ReviewChangePhaseBlock } from "./ReviewChangePhaseBlock";
import { ReviewStripeIdsPopover } from "./ReviewStripeIdsPopover";
import { ReviewSystemMark } from "./ReviewSystemMark";

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
			<AccordionTrigger className="h-[42px] items-center gap-[9px] rounded-none py-0 hover:no-underline [&>svg]:translate-y-0">
				<ReviewSystemMark system={system} />
				<span className="text-sm font-medium text-foreground">{title}</span>
				<ReviewStripeIdsPopover stripeIds={section.stripeIds ?? []} />
				<span className="flex-1" />
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="min-w-0 truncate text-xs font-normal text-tertiary-foreground">
							{section.summary}
						</span>
					</TooltipTrigger>
					<TooltipContent side="top">{section.summary}</TooltipContent>
				</Tooltip>
			</AccordionTrigger>
			<AccordionContent className="pb-4">
				<div className="flex flex-col gap-4">
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
