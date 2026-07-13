import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { addHours, isAfter } from "date-fns";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { useAttachBillingOptionsState } from "../hooks/useAttachBillingOptionsState";
import { isFutureStartDate } from "../utils/buildAttachPreviewTotals";

export function getConfirmLabel({
	previewData,
	startDate,
	now,
}: {
	previewData:
		| {
				redirect_to_checkout: boolean;
				total: number;
				outgoing?: { effective_at: number | null }[];
		  }
		| null
		| undefined;
	startDate: number | null;
	now?: number;
}): string {
	if (!previewData) return "Attach Plan";
	if (isFutureStartDate(startDate, now)) return "Preview Schedule";
	if (previewData.redirect_to_checkout) return "Generate Checkout URL";

	const sixHoursFromNow = addHours(now ?? Date.now(), 6);
	const isScheduled = previewData.outgoing?.some(
		(change) =>
			change.effective_at !== null &&
			isAfter(change.effective_at, sixHoursFromNow),
	);
	if (isScheduled) return "Schedule Change";

	if (previewData.total <= 0) return "Attach Plan";

	return "Charge Customer";
}

export function AttachFooterV3() {
	const { isPending, previewQuery, handleConfirm, handleInvoiceAttach, formValues } =
		useAttachFormContext();
	const { setSheet } = useSheetStore();
	const itemId = useSheetStore((s) => s.itemId);

	const { isEndOfCycleSelected, createsRecurringSubscription } =
		useAttachBillingOptionsState();

	const previewData = previewQuery.data;
	const hasFutureStartDate = isFutureStartDate(formValues.startDate);
	const confirmLabel = getConfirmLabel({
		previewData,
		startDate: formValues.startDate,
	});

	const hasNothingToInvoice =
		!!previewData && previewData.total <= 0 && !createsRecurringSubscription;

	const invoiceDisabledReason = isEndOfCycleSelected
		? "Invoices are not available for end of cycle changes as there is no immediate charge to invoice"
		: hasFutureStartDate
			? "Invoices are not available for future start dates. Schedule the plan instead."
			: hasNothingToInvoice
				? "Cannot send an invoice for $0 amounts. Please confirm the change instead."
				: null;

	// Usage-in-arrears subscription: nothing to invoice now, so start it directly
	// in invoice mode instead of opening the send-invoice sheet.
	const isInvoiceOnlyStart =
		!!previewData && previewData.total <= 0 && createsRecurringSubscription;

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
				<Tooltip>
					<TooltipTrigger asChild>
						<span
							className={cn(
								"flex w-full",
								invoiceDisabledReason && "cursor-not-allowed",
							)}
						>
							<Button
								variant="secondary"
								className={cn(
									"w-full",
									invoiceDisabledReason && "pointer-events-none opacity-50",
								)}
								disabled={!invoiceDisabledReason && isPending}
								isLoading={isInvoiceOnlyStart && isPending}
								onClick={handleInvoiceButtonClick}
							>
								{invoiceButtonLabel}
							</Button>
						</span>
					</TooltipTrigger>
					{invoiceDisabledReason && (
						<TooltipContent side="top" className="max-w-(--anchor-width)">
							{invoiceDisabledReason}
						</TooltipContent>
					)}
				</Tooltip>
				<Button
					variant="primary"
					className="w-full"
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
