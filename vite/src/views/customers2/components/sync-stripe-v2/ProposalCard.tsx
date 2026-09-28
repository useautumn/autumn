import type { SubscriptionMismatch, SyncProposalV2 } from "@autumn/shared";
import { ArrowRightIcon, CaretRightIcon } from "@phosphor-icons/react";
import {
	TABLE_TRAY_SURFACE_CLASS,
	TABLE_TRAY_SURFACE_ROW_CLASS,
} from "@/components/general/table";
import { StripeIcon } from "@/components/v2/icons/AutumnIcons";
import { cn } from "@/lib/utils";
import { ProposalSyncStateChip } from "./ProposalSyncStateChip";
import { ProposalSyncStateIcon } from "./ProposalSyncStateIcon";
import { proposalSyncSummary } from "./proposalSyncSummary";
import { buildPhaseSections } from "./syncPhaseSections";

export function ProposalCard({
	proposal,
	objectId,
	mismatches,
	productNamesById,
	onSelect,
}: {
	proposal: SyncProposalV2;
	objectId: string;
	mismatches: SubscriptionMismatch[] | undefined;
	productNamesById: Record<string, string>;
	onSelect: () => void;
}) {
	const { state, planNames, note } = proposalSyncSummary({
		proposal,
		mismatches,
		productNamesById,
	});
	const stripeItems = (buildPhaseSections({ proposal })[0]?.displayItems ?? [])
		.map(({ name, priceLabel }) => `${name} · ${priceLabel}`)
		.join(", ");

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				TABLE_TRAY_SURFACE_CLASS,
				"w-full cursor-pointer text-left transition-colors hover:border-foreground/20",
			)}
		>
			<div
				className={cn(
					"flex min-h-9 items-center gap-2 px-3",
					TABLE_TRAY_SURFACE_ROW_CLASS,
				)}
			>
				<StripeIcon size={14} className="shrink-0 text-indigo-500" />
				<code className="truncate font-mono text-xs text-tertiary-foreground">
					{objectId}
				</code>
				<span className="flex-1" />
				<ProposalSyncStateChip state={state} />
				<CaretRightIcon size={12} className="shrink-0 text-subtle" />
			</div>
			<div className="flex min-h-9 min-w-0 items-center gap-2 border-b border-table-row-divider px-3 text-sm">
				<span className="min-w-0 truncate text-foreground">
					{stripeItems || "No Stripe items"}
				</span>
				<ArrowRightIcon size={12} className="shrink-0 text-subtle" />
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
				<ProposalSyncStateIcon state={state} />
				<span className="truncate">{note}</span>
			</div>
		</button>
	);
}
