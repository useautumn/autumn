import type { SetPlansReviewSection } from "@autumn/shared";
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
import { formatReviewText } from "../../utils/review/formatReviewText";
import type { SkeletonScope } from "../../utils/review/formPhasesToSkeletonPhases";
import { hasScopedRows } from "../../utils/review/groupRowsByScope";
import { reviewValueColumnWidth } from "../../utils/review/reviewValueColumnWidth";
import type {
	ReviewGroupLayout,
	ReviewGroupSystem,
} from "../../utils/review/types/reviewGroup";
import { ReviewChangePhaseBlock } from "./ReviewChangePhaseBlock";
import { ReviewChangeSkeletonPhases } from "./ReviewChangeSkeletonPhases";
import { ReviewPhaseTimeline } from "./ReviewPhaseTimeline";
import { ReviewPricingTable } from "./ReviewPricingTable";
import { ReviewPricingTableSkeleton } from "./ReviewPricingTableSkeleton";
import { ReviewStripeIdsPopover } from "./ReviewStripeIdsPopover";
import { ReviewSystemMark } from "./ReviewSystemMark";
import { ReviewValueColumnProvider } from "./ReviewValueColumnContext";

const hasContent = (section: SetPlansReviewSection) =>
	section.phases.length > 0 || Boolean(section.stripe_ids?.length);

function ReviewSummary({ summary }: { summary: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="min-w-0 truncate text-xs font-normal text-tertiary-foreground">
					{summary}
				</span>
			</TooltipTrigger>
			<TooltipContent side="top">{summary}</TooltipContent>
		</Tooltip>
	);
}

/** Renders a skeleton in the same slots until `section` resolves, so nothing shifts on load. */
export function ReviewChangeGroup({
	value,
	system,
	title,
	layout = "plan_rows",
	section,
	placeholderPhases = [],
}: {
	value: string;
	system: ReviewGroupSystem;
	title: string;
	layout?: ReviewGroupLayout;
	section?: SetPlansReviewSection;
	placeholderPhases?: SkeletonScope[][];
}) {
	const showsStatus = Boolean(
		section?.phases.some((phase) => phase.rows.some((row) => row.status)),
	);

	const isEmpty = section ? !hasContent(section) : false;
	const showsScopes = Boolean(
		section?.phases.some((phase) => hasScopedRows({ rows: phase.rows })),
	);

	return (
		<AccordionItem value={value} disabled={isEmpty} className="border-none">
			<AccordionTrigger
				className={cn(
					"h-[42px] min-w-0 items-center gap-[9px] rounded-none py-0 hover:no-underline [&>svg]:translate-y-0",
					isEmpty &&
						"disabled:opacity-100 data-disabled:opacity-100 [&>svg]:invisible",
				)}
			>
				<ReviewSystemMark system={system} />
				<span className="shrink-0 text-sm font-medium text-foreground">
					{title}
				</span>
				<ReviewStripeIdsPopover stripeIds={section?.stripe_ids ?? []} />
				<span className="flex-1" />
				{section && section.phases.length > 1 ? (
					<ReviewPhaseTimeline phases={section.phases} system={system} />
				) : section ? (
					<ReviewSummary summary={formatReviewText(section.summary)} />
				) : (
					<Skeleton className="h-3.5 w-24 rounded-sm" />
				)}
			</AccordionTrigger>
			{!isEmpty && (
				<AccordionContent className="pb-4">
					<ReviewChangeGroupBody
						layout={layout}
						section={section}
						placeholderPhases={placeholderPhases}
						showsStatus={showsStatus}
						showsScopes={showsScopes}
					/>
				</AccordionContent>
			)}
		</AccordionItem>
	);
}

function ReviewChangeGroupBody({
	layout,
	section,
	placeholderPhases,
	showsStatus,
	showsScopes,
}: {
	layout: ReviewGroupLayout;
	section?: SetPlansReviewSection;
	placeholderPhases: SkeletonScope[][];
	showsStatus: boolean;
	showsScopes: boolean;
}) {
	if (layout === "pricing_table") {
		return section ? (
			<ReviewPricingTable phases={section.phases} />
		) : (
			<ReviewPricingTableSkeleton phases={placeholderPhases} />
		);
	}
	if (!section)
		return <ReviewChangeSkeletonPhases phases={placeholderPhases} />;
	return (
		<ReviewValueColumnProvider value={reviewValueColumnWidth(section)}>
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
		</ReviewValueColumnProvider>
	);
}
