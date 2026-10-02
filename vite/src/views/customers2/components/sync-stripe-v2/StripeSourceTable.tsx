import type { SubscriptionMismatch, SyncProposalV2 } from "@autumn/shared";
import { StatusChipIcon } from "@autumn/ui";
import {
	ArrowSquareOutIcon,
	CaretDownIcon,
	CaretRightIcon,
} from "@phosphor-icons/react";
import { Fragment, type MouseEvent, useId, useState } from "react";
import { TABLE_TRAY_SURFACE_CLASS } from "@/components/general/table";
import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { useStripeDashboardLink } from "@/hooks/useStripeDashboardLink";
import { cn } from "@/lib/utils";
import {
	rollUpStripeItemMarks,
	type StripeItemMark,
	stripeItemMark,
} from "./previewMismatches";
import { StripeItemMatchIcon } from "./StripeItemMatchIcon";
import {
	STRIPE_ICON_LANE_CLASS,
	STRIPE_ROW_CLASS,
	StripeItemRow,
} from "./StripeItemRow";
import { StripeStatusBadge } from "./StripeStatusBadge";
import { formatPhaseStart, type PhaseSection } from "./syncPhaseSections";

const OVERALL_MATCH_TOOLTIPS: Record<StripeItemMark, string> = {
	linked: "All items matched",
	links_on_sync: "All items match after sync",
	out_of_sync: "Some items are not matched",
};

export function StripeSourceTable({
	proposal,
	phaseSections,
	showPhases,
	todayMismatches,
	previewMismatches,
	isLoadingMatches,
}: {
	proposal: SyncProposalV2;
	phaseSections: PhaseSection[];
	showPhases: boolean;
	todayMismatches: SubscriptionMismatch[] | undefined;
	previewMismatches: SubscriptionMismatch[] | undefined;
	isLoadingMatches: boolean;
}) {
	const getStripeLink = useStripeDashboardLink();
	const [isExpanded, setIsExpanded] = useState(false);
	const itemsRegionId = useId();
	const stripePath = proposal.stripe_subscription_id
		? `subscriptions/${proposal.stripe_subscription_id}`
		: proposal.stripe_schedule_id &&
			`subscription_schedules/${proposal.stripe_schedule_id}`;

	const markedSections = phaseSections.map((section) => ({
		section,
		items: section.displayItems.map((item) => ({
			item,
			mark: stripeItemMark({
				todayMismatches,
				previewMismatches,
				stripePriceId: item.stripePriceId,
				startsAt: section.phase.starts_at,
			}),
		})),
	}));
	const overallMark = rollUpStripeItemMarks(
		markedSections.flatMap(({ items }) => items.map(({ mark }) => mark)),
	);
	const CaretIcon = isExpanded ? CaretDownIcon : CaretRightIcon;
	const toggleExpanded = () => setIsExpanded(!isExpanded);
	const toggleOnHeaderClick = () => {
		const isSelectingText = Boolean(window.getSelection()?.toString());
		if (!isSelectingText) toggleExpanded();
	};
	const toggleOnCaretClick = (event: MouseEvent) => {
		event.stopPropagation();
		toggleExpanded();
	};
	const openInStripe = (event: MouseEvent) => {
		event.stopPropagation();
		if (stripePath) window.open(getStripeLink(stripePath), "_blank");
	};

	return (
		<div className={TABLE_TRAY_SURFACE_CLASS}>
			<div
				className={cn(STRIPE_ROW_CLASS, "cursor-pointer")}
				onClick={toggleOnHeaderClick}
			>
				<span className={STRIPE_ICON_LANE_CLASS}>
					{isLoadingMatches ? (
						<StatusChipIcon tone="neutral" glyph="spinner" />
					) : overallMark ? (
						<StripeItemMatchIcon
							mark={overallMark}
							tooltip={OVERALL_MATCH_TOOLTIPS[overallMark]}
						/>
					) : (
						<StripeIcon size={14} className="text-indigo-500" />
					)}
				</span>
				<code className="truncate font-mono text-xs text-foreground">
					{proposal.stripe_subscription_id ?? proposal.stripe_schedule_id}
				</code>
				{stripePath && (
					<button
						type="button"
						onClick={openInStripe}
						aria-label="Open in Stripe"
						className="shrink-0 cursor-pointer text-subtle transition-colors hover:text-foreground"
					>
						<ArrowSquareOutIcon size={13} />
					</button>
				)}
				<span className="flex-1" />
				<StripeStatusBadge proposal={proposal} />
				<button
					type="button"
					onClick={toggleOnCaretClick}
					aria-expanded={isExpanded}
					aria-controls={isExpanded ? itemsRegionId : undefined}
					aria-label={isExpanded ? "Hide items" : "Show items"}
					className="flex shrink-0 cursor-pointer rounded-sm text-subtle outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<CaretIcon size={12} />
				</button>
			</div>
			{isExpanded && (
				<div id={itemsRegionId}>
					{markedSections.map(({ section, items }, phaseIndex) => (
						<Fragment key={`phase-${phaseIndex}-${section.phase.starts_at}`}>
							{showPhases && (
								<div className="flex h-7 items-center gap-2 border-b border-table-row-divider bg-table-tray/50 px-3 text-xs text-tertiary-foreground">
									<span className={STRIPE_ICON_LANE_CLASS} />
									<span className="flex-1 font-medium">
										Phase {phaseIndex + 1}
									</span>
									<span>{formatPhaseStart(section.phase.starts_at)}</span>
								</div>
							)}
							{items.map(({ item, mark }) => (
								<StripeItemRow key={item.key} item={item} mark={mark} />
							))}
						</Fragment>
					))}
				</div>
			)}
		</div>
	);
}
