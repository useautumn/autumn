import { StatusChip, type StatusGlyph, type StatusTone } from "@autumn/ui";
import type { ProposalSyncState } from "./proposalSyncSummary";

export const PROPOSAL_SYNC_STATES: Record<
	ProposalSyncState,
	{ label: string; tone: StatusTone; glyph: StatusGlyph }
> = {
	in_sync: { label: "In sync", tone: "green", glyph: "check" },
	out_of_sync: { label: "Out of sync", tone: "amber", glyph: "alert" },
	linked: { label: "Linked", tone: "neutral", glyph: "check" },
	ready_to_link: { label: "Ready to link", tone: "blue", glyph: "refresh" },
	no_match: { label: "No match", tone: "neutral", glyph: "dashed" },
	change_scheduled: {
		label: "Change scheduled",
		tone: "neutral",
		glyph: "calendar",
	},
};

export function ProposalSyncStateChip({ state }: { state: ProposalSyncState }) {
	const { label, tone, glyph } = PROPOSAL_SYNC_STATES[state];
	return (
		<StatusChip tone={tone} glyph={glyph}>
			{label}
		</StatusChip>
	);
}
