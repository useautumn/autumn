import { Button } from "@autumn/ui";
import { DisabledTooltipButton } from "@/components/forms/shared";
import { BillingFooter } from "@/components/forms/shared/BillingFooter";
import {
	getInvoiceButtonState,
	shouldDisableInvoiceButton,
} from "@/components/forms/shared/utils/invoiceButtonState";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { getBackendErr } from "@/utils/genUtils";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { isFutureStartDate } from "../utils/buildAttachPreviewTotals";
import { getAttachConfirmLabel } from "../utils/getAttachConfirmLabel";
import { shouldDisableAttachInvoiceButton } from "../utils/shouldDisableAttachInvoiceButton";

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
	const previewError = previewQuery.error
		? getBackendErr(previewQuery.error, "Failed to load preview")
		: undefined;
	const previewFailed = !!previewError;
	const isMultiPlan = additionalPlans.isMultiPlan;
	const startDate = isMultiPlan ? null : formValues.startDate;
	const hasFutureStartDate = isFutureStartDate(startDate);
	const confirmLabel = getAttachConfirmLabel({ previewData, startDate });

	const { isInvoiceOnlyStart, label, zeroAmountReason } = getInvoiceButtonState(
		{
			preview: previewData,
			previewFailed,
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
<<<<<<< Updated upstream
		<BillingFooter layout="stacked">
			<DisabledTooltipButton
				variant="secondary"
				className="w-full"
				disabled={shouldDisableInvoiceButton({ isPending, previewError })}
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
=======
		<SheetFooter className="flex flex-col grid-cols-1 mt-0">
			<div className="flex flex-col gap-2 w-full">
				<DisabledTooltipButton
					variant="secondary"
					className="w-full"
					disabled={shouldDisableAttachInvoiceButton({
						isPending,
						previewError,
					})}
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
>>>>>>> Stashed changes
	);
}
