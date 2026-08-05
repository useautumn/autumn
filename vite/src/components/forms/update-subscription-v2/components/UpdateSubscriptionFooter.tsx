import { Button } from "@autumn/ui";
import { DisabledTooltipButton } from "@/components/forms/shared";
import { BillingFooter } from "@/components/forms/shared/BillingFooter";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

export function UpdateSubscriptionFooter() {
	const { isPending, hasChanges, previewQuery, handleConfirm } =
		useUpdateSubscriptionFormContext();
	const { setSheet } = useSheetStore();
	const itemId = useSheetStore((s) => s.itemId);

	const isReady = hasChanges && !previewQuery.isLoading && !previewQuery.error;

	const previewData = previewQuery.data;
	const isZeroAmount = previewData && previewData.total <= 0;
	const invoiceDisabledReason = isZeroAmount
		? "Cannot send an invoice for $0 amounts. Please confirm the change instead."
		: null;

	return (
		<BillingFooter layout="stacked" isReady={isReady} reveal>
			<DisabledTooltipButton
				variant="secondary"
				className="w-full"
				disabled={isPending}
				disabledReason={invoiceDisabledReason}
				tooltipClassName="max-w-(--anchor-width)"
				onClick={() =>
					setSheet({ type: "subscription-update-send-invoice", itemId })
				}
			>
				Send an Invoice
			</DisabledTooltipButton>
			<Button
				variant="primary"
				className="w-full"
				onClick={handleConfirm}
				isLoading={isPending}
			>
				Confirm Update
			</Button>
		</BillingFooter>
	);
}
