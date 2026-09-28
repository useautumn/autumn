import { StatusChipIcon } from "@autumn/ui";
import { PROPOSAL_SYNC_STATES } from "./ProposalSyncStateChip";
import type { ProposalSyncState } from "./proposalSyncSummary";

export function ProposalSyncStateIcon({ state }: { state: ProposalSyncState }) {
	const { tone, glyph } = PROPOSAL_SYNC_STATES[state];
	return <StatusChipIcon tone={tone} glyph={glyph} />;
}
