import type { SubscriptionMismatch, SyncProposalV2 } from "@autumn/shared";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { Fragment } from "react";
import { TABLE_TRAY_SURFACE_CLASS } from "@/components/general/table";
import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { useStripeDashboardLink } from "@/hooks/useStripeDashboardLink";
import { stripeItemMark } from "./previewMismatches";
import { STRIPE_ROW_CLASS, StripeItemRow } from "./StripeItemRow";
import { StripeStatusBadge } from "./StripeStatusBadge";
import { formatPhaseStart, type PhaseSection } from "./syncPhaseSections";

export function StripeSourceTable({
	proposal,
	phaseSections,
	showPhases,
	todayMismatches,
	previewMismatches,
}: {
	proposal: SyncProposalV2;
	phaseSections: PhaseSection[];
	showPhases: boolean;
	todayMismatches: SubscriptionMismatch[] | undefined;
	previewMismatches: SubscriptionMismatch[] | undefined;
}) {
	const getStripeLink = useStripeDashboardLink();
	const stripePath = proposal.stripe_subscription_id
		? `subscriptions/${proposal.stripe_subscription_id}`
		: proposal.stripe_schedule_id &&
			`subscription_schedules/${proposal.stripe_schedule_id}`;

	return (
		<div className={TABLE_TRAY_SURFACE_CLASS}>
			<div className={STRIPE_ROW_CLASS}>
				<StripeIcon size={14} className="shrink-0 text-indigo-500" />
				<code className="truncate font-mono text-xs text-foreground">
					{proposal.stripe_subscription_id ?? proposal.stripe_schedule_id}
				</code>
				{stripePath && (
					<button
						type="button"
						onClick={() => window.open(getStripeLink(stripePath), "_blank")}
						aria-label="Open in Stripe"
						className="shrink-0 cursor-pointer text-subtle transition-colors hover:text-foreground"
					>
						<ArrowSquareOutIcon size={13} />
					</button>
				)}
				<span className="flex-1" />
				<StripeStatusBadge proposal={proposal} />
			</div>
			{phaseSections.map((section, phaseIndex) => (
				<Fragment key={`phase-${phaseIndex}-${section.phase.starts_at}`}>
					{showPhases && (
						<div className="flex h-7 items-center justify-between border-b border-table-row-divider bg-table-tray/50 px-3 text-xs text-tertiary-foreground">
							<span className="font-medium">Phase {phaseIndex + 1}</span>
							<span>{formatPhaseStart(section.phase.starts_at)}</span>
						</div>
					)}
					{section.displayItems.map((item) => (
						<StripeItemRow
							key={item.key}
							item={item}
							mark={stripeItemMark({
								todayMismatches,
								previewMismatches,
								stripePriceId: item.stripePriceId,
								startsAt: section.phase.starts_at,
							})}
						/>
					))}
				</Fragment>
			))}
		</div>
	);
}
