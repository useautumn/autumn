import type { SubscriptionMismatch, SyncProposalV2 } from "@autumn/shared";
import { stripeItemMark } from "../previewMismatches";
import { DEFAULT_SYNC_OPTIONS } from "../SyncOptionsTable";
import type { PhaseSection } from "../syncPhaseSections";
import { useProposalCustomerState } from "./useProposalCustomerState";
import { useSyncPreview } from "./useSyncPreview";

export const useProposalItemMarks = ({
	proposal,
	section,
	todayMismatches,
}: {
	proposal: SyncProposalV2;
	section: PhaseSection | undefined;
	todayMismatches: SubscriptionMismatch[] | undefined;
}) => {
	const formValues = useProposalCustomerState({ proposal });
	const { previewMismatches } = useSyncPreview({
		proposal,
		formValues,
		options: DEFAULT_SYNC_OPTIONS,
	});

	return (stripePriceId: string) =>
		section &&
		stripeItemMark({
			todayMismatches,
			previewMismatches,
			stripePriceId,
			startsAt: section.phase.starts_at,
		});
};
