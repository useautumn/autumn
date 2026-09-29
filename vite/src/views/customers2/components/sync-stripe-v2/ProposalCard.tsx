import type { SyncProposalV2 } from "@autumn/shared";
import { StatusChipIcon } from "@autumn/ui";
import { CaretRightIcon } from "@phosphor-icons/react";
import { TABLE_TRAY_SURFACE_CLASS } from "@/components/general/table";
import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { cn } from "@/lib/utils";
import { useTodayMismatches } from "./hooks/useTodayMismatches";
import {
	PROPOSAL_SYNC_STATES,
	ProposalSyncStateChip,
} from "./ProposalSyncStateChip";
import { stripeItemMark } from "./previewMismatches";
import { proposalSyncSummary } from "./proposalSyncSummary";
import { STRIPE_ROW_CLASS, StripeItemRow } from "./StripeItemRow";
import { buildPhaseSections } from "./syncPhaseSections";

export function ProposalCard({
	proposal,
	objectId,
	productNamesById,
	onSelect,
}: {
	proposal: SyncProposalV2;
	objectId: string;
	productNamesById: Record<string, string>;
	onSelect: () => void;
}) {
	const { mismatches, isVerifying } = useTodayMismatches({ proposal });
	const { state, planNames, note } = proposalSyncSummary({
		proposal,
		mismatches: isVerifying ? undefined : mismatches,
		productNamesById,
	});
	const [section] = buildPhaseSections({ proposal });
	// The list uses today's verify only; "matched after sync" needs a preview, which runs once a subscription is opened.
	const itemMark = (stripePriceId: string) =>
		section &&
		stripeItemMark({
			todayMismatches: mismatches,
			previewMismatches: mismatches,
			stripePriceId,
			startsAt: section.phase.starts_at,
		});

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				TABLE_TRAY_SURFACE_CLASS,
				"w-full cursor-pointer text-left transition-colors hover:border-foreground/20",
			)}
		>
			<div className={STRIPE_ROW_CLASS}>
				<StripeIcon size={14} className="shrink-0 text-indigo-500" />
				<code className="truncate font-mono text-xs text-tertiary-foreground">
					{objectId}
				</code>
				<span className="flex-1" />
				<ProposalSyncStateChip state={state} />
				<CaretRightIcon size={12} className="shrink-0 text-subtle" />
			</div>
			{section?.displayItems.map((item) => (
				<StripeItemRow
					key={item.key}
					item={item}
					mark={itemMark(item.stripePriceId)}
				/>
			))}
			<div className={STRIPE_ROW_CLASS}>
				<span className="text-xs text-tertiary-foreground">Links to</span>
				<span
					className={cn(
						"min-w-0 truncate font-medium",
						planNames.length > 0
							? "text-foreground"
							: "text-tertiary-foreground",
					)}
				>
					{planNames.join(", ") || "No Autumn plan"}
				</span>
			</div>
			<div
				className={cn(
					"flex h-7 items-center gap-1.5 bg-table-tray/50 px-3 text-xs",
					state === "out_of_sync"
						? "text-amber-500"
						: "text-tertiary-foreground",
				)}
			>
				<StatusChipIcon
					tone={PROPOSAL_SYNC_STATES[state].tone}
					glyph={PROPOSAL_SYNC_STATES[state].glyph}
				/>
				<span className="truncate">{note}</span>
			</div>
		</button>
	);
}
