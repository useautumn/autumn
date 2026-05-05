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

	const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<
		string | null
	>(null);

	const selectedProposal = selectedSubscriptionId
		? (proposals.find(
				(p) => p.stripe_subscription_id === selectedSubscriptionId,
			) ?? null)
		: null;

	const headerTitle = selectedProposal
		? "Configure sync"
		: "Sync from Stripe";
	const headerDescription = selectedProposal
		? "Pick the Autumn plans to attach for this subscription"
		: "Pick a Stripe subscription to import";

	return (
		<div className="flex flex-col h-full">
			<SheetHeader title={headerTitle} description={headerDescription} />

			{!selectedProposal && (
				<SubscriptionListView
					proposals={proposals}
					isLoading={isLoading}
					error={error}
					onSelect={setSelectedSubscriptionId}
				/>
			)}

			{selectedProposal && (
				<SubscriptionEditorView
					proposal={selectedProposal}
					customerId={customerId}
					onBack={() => setSelectedSubscriptionId(null)}
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
