import { Button } from "@autumn/ui";
import { DisabledTooltipButton } from "@/components/forms/shared";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";
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
	const confirmLabel = getAttachConfirmLabel({
		previewData,
		startDate,
	});

	const hasNothingToInvoice =
		!!previewData && previewData.total <= 0 && !createsRecurringSubscription;

	let invoiceDisabledReason: string | null = null;
	if (!isMultiPlan && isEndOfCycleSelected) {
		invoiceDisabledReason =
			"Invoices are not available for end of cycle changes as there is no immediate charge to invoice";
	} else if (hasFutureStartDate) {
		invoiceDisabledReason =
			"Invoices are not available for future start dates. Schedule the plan instead.";
	} else if (hasNothingToInvoice) {
		invoiceDisabledReason =
			"Cannot send an invoice for $0 amounts. Please confirm the change instead.";
	}

	// Trials and credit-covered charges still create a $0 invoice, so keep the
	// invoice sheet for those; only bypass it when no invoice is created at all.
	const willCreateZeroDollarInvoice =
		(previewData?.subtotal ?? 0) > 0 ||
		(previewData?.invoice_credits?.balance ?? 0) > 0 ||
		formValues.trialEnabled === true;

	const isInvoiceOnlyStart =
		!!previewData &&
		previewData.total <= 0 &&
		createsRecurringSubscription &&
		!willCreateZeroDollarInvoice;

	const invoiceButtonLabel = isInvoiceOnlyStart
		? "Start subscription in invoice mode"
		: "Send an Invoice";

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
		<SheetFooter className="flex flex-col grid-cols-1 mt-0">
			<div className="flex flex-col gap-2 w-full">
				<DisabledTooltipButton
					variant="secondary"
					className="w-full"
					disabled={previewFailed || isPending}
					disabledReason={invoiceDisabledReason}
					tooltipClassName="max-w-(--anchor-width)"
					isLoading={isInvoiceOnlyStart && isPending}
					onClick={handleInvoiceButtonClick}
				>
					{invoiceButtonLabel}
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
			</div>
		</SheetFooter>
	);
}
