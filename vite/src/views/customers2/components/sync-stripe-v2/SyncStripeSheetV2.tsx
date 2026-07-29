import { useState } from "react";
import { SheetHeader } from "@/components/v2/sheets/SharedSheetComponents";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useSyncProposalsV2 } from "./hooks/useSyncProposalsV2";
import { SubscriptionEditorView } from "./SubscriptionEditorView";
import { SubscriptionListView } from "./SubscriptionListView";

export function SyncStripeSheetV2() {
	const { customer, refetch: refetchCustomer } = useCusQuery();
	const closeSheet = useSheetStore((s) => s.closeSheet);

	const customerId = customer?.id ?? "";
	const { proposals, isLoading, error, syncMutation } = useSyncProposalsV2({
		customerId,
	});

	const [selectedProposalIndex, setSelectedProposalIndex] = useState<
		number | null
	>(null);

	const selectedProposal =
		selectedProposalIndex !== null
			? (proposals[selectedProposalIndex] ?? null)
			: null;

	const headerTitle = selectedProposal ? "Configure sync" : "Sync from Stripe";
	const headerDescription = selectedProposal
		? "Pick the Autumn plans to attach for this Stripe object"
		: "Pick a Stripe subscription or schedule to import";

	return (
		<div className="flex flex-col h-full">
			<SheetHeader title={headerTitle} description={headerDescription} />

			{!selectedProposal && (
				<SubscriptionListView
					proposals={proposals}
					isLoading={isLoading}
					error={error}
					onSelect={setSelectedProposalIndex}
				/>
			)}

			{selectedProposal && (
				<SubscriptionEditorView
					proposal={selectedProposal}
					customerId={customerId}
					onBack={() => setSelectedProposalIndex(null)}
					onSubmit={(params) =>
						syncMutation.mutate(params, {
							onSuccess: () => {
								refetchCustomer();
								closeSheet();
							},
						})
					}
					isSubmitting={syncMutation.isPending}
				/>
			)}
		</div>
	);
}
