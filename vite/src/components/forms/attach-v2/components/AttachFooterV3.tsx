import { Button } from "@autumn/ui";
import { DisabledTooltipButton } from "@/components/forms/shared";
import { BillingFooter } from "@/components/forms/shared/BillingFooter";
import { getInvoiceButtonState } from "@/components/forms/shared/utils/invoiceButtonState";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { isFutureStartDate } from "../utils/buildAttachPreviewTotals";
import { getAttachConfirmLabel } from "../utils/getAttachConfirmLabel";

export function AttachFooterV3() {
	const {
		isPending,
		previewQuery,
		handleConfirm,
		handleInvoiceAttach,
		formValues,
		additionalPlans,
		billingOptions,
	} = useAttachFormContext();
	const { setSheet } = useSheetStore();
	const itemId = useSheetStore((s) => s.itemId);

	const { isEndOfCycleSelected, createsRecurringSubscription } = billingOptions;

	const previewData = previewQuery.data;
	const previewFailed = !!previewQuery.error;
	const isMultiPlan = additionalPlans.isMultiPlan;
	const startDate = isMultiPlan ? null : formValues.startDate;
	const hasFutureStartDate = isFutureStartDate(startDate);
	const confirmLabel = getAttachConfirmLabel({ previewData, startDate });

	const { isInvoiceOnlyStart, label, zeroAmountReason } = getInvoiceButtonState(
		{
			preview: previewData,
			createsRecurringSubscription,
			trialEnabled: formValues.trialEnabled === true,
		},
	);

	let invoiceDisabledReason: string | null = null;
	if (!isMultiPlan && isEndOfCycleSelected) {
		invoiceDisabledReason =
			"Invoices are not available for end of cycle changes as there is no immediate charge to invoice";
	} else if (hasFutureStartDate) {
		invoiceDisabledReason =
			"Invoices are not available for future start dates. Schedule the plan instead.";
	} else {
		invoiceDisabledReason = zeroAmountReason;
	}

	const handleInvoiceButtonClick = () => {
		if (isInvoiceOnlyStart) {
			handleInvoiceAttach({
				enableProductImmediately: true,
				finalizeInvoice: true,
			});
			return;
		}
		setSheet({ type: "attach-send-invoice", itemId });
	};

	return (
		<BillingFooter layout="stacked">
			<DisabledTooltipButton
				variant="secondary"
				className="w-full"
				disabled={previewFailed || isPending}
				disabledReason={invoiceDisabledReason}
				tooltipClassName="max-w-(--anchor-width)"
				isLoading={isInvoiceOnlyStart && isPending}
				onClick={handleInvoiceButtonClick}
			>
				{label}
			</DisabledTooltipButton>
			<Button
				variant="primary"
				className="w-full"
				disabled={previewFailed}
				onClick={() => {
					if (hasFutureStartDate) {
						setSheet({ type: "attach-schedule-plan", itemId });
					} else if (previewData?.redirect_to_checkout) {
						setSheet({ type: "attach-checkout-session", itemId });
					} else {
						handleConfirm();
					}
				}}
				isLoading={isPending}
			>
				{confirmLabel}
			</Button>
		</BillingFooter>
	);
}
