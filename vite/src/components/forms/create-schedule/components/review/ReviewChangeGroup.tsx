import {
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	Skeleton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { cn } from "@/lib/utils";
import { hasScopedRows } from "../../utils/review/groupRowsByScope";
import type {
	ReviewChangeSection,
	ReviewChangeSystem,
} from "../../utils/review/types/reviewChange";
import { ReviewChangePhaseBlock } from "./ReviewChangePhaseBlock";
import { ReviewChangeSkeletonPhases } from "./ReviewChangeSkeletonPhases";
import { ReviewStripeIdsPopover } from "./ReviewStripeIdsPopover";
import { ReviewSystemMark } from "./ReviewSystemMark";

const hasContent = (section: ReviewChangeSection) =>
	section.phases.length > 0 || Boolean(section.stripeIds?.length);

/** Renders a skeleton in the same slots until `section` resolves, so nothing shifts on load. */
export function ReviewChangeGroup({
	value,
	system,
	title,
	section,
	placeholderRowCounts = [],
}: {
	value: string;
	system: ReviewChangeSystem;
	title: string;
	section?: ReviewChangeSection;
	placeholderRowCounts?: number[];
}) {
	const showsStatus = Boolean(
		section?.phases.some((phase) =>
			phase.rows.some(
				(row) => row.status || row.items?.some((item) => item.status),
			),
		),
	);

	const isEmpty = section ? !hasContent(section) : false;
	const showsScopes = Boolean(
		section?.phases.some((phase) => hasScopedRows({ rows: phase.rows })),
	);

	return (
		<AccordionItem value={value} disabled={isEmpty} className="border-none">
			<AccordionTrigger
				className={cn(
					"h-[42px] items-center gap-[9px] rounded-none py-0 hover:no-underline [&>svg]:translate-y-0",
					isEmpty &&
						"disabled:opacity-100 data-disabled:opacity-100 [&>svg]:invisible",
				)}
			>
				<ReviewSystemMark system={system} />
				<span className="text-sm font-medium text-foreground">{title}</span>
				<ReviewStripeIdsPopover stripeIds={section?.stripeIds ?? []} />
				<span className="flex-1" />
				{section ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="min-w-0 truncate text-xs font-normal text-tertiary-foreground">
								{section.summary}
							</span>
						</TooltipTrigger>
						<TooltipContent side="top">{section.summary}</TooltipContent>
					</Tooltip>
				) : (
					<Skeleton className="h-3.5 w-24 rounded-sm" />
				)}
			</AccordionTrigger>
			<AccordionContent className="pb-4">
				{section ? (
					<div className="flex flex-col gap-4">
						{section.phases.map((phase) => (
							<ReviewChangePhaseBlock
								key={phase.key}
								phase={phase}
								showsStatus={showsStatus}
								showsScopes={showsScopes}
							/>
						))}
					</div>
				) : (
					<ReviewChangeSkeletonPhases rowCounts={placeholderRowCounts} />
				)}
			</AccordionContent>
		</AccordionItem>
	);
}
