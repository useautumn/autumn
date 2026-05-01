import { Button } from "@/components/v2/buttons/Button";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { usePlanScheduleField } from "../hooks/usePlanScheduleField";

function getConfirmLabel({
	previewData,
}: {
	previewData:
		| {
				redirect_to_checkout: boolean;
				total: number;
				outgoing?: { effective_at: number | null }[];
		  }
		| null
		| undefined;
}): string {
	if (!previewData) return "Attach Plan";

	const sixHoursFromNow = Date.now() + 6 * 60 * 60 * 1000;
	const isScheduled = previewData.outgoing?.some(
		(change) =>
			change.effective_at !== null && change.effective_at > sixHoursFromNow,
	);
	if (isScheduled) return "Schedule Change";

	if (previewData.redirect_to_checkout) return "Generate Checkout URL";

	if (previewData.total <= 0) return "Attach Plan";

	return "Charge Customer";
}

export function AttachFooterV3() {
	const { isPending, previewQuery, handleConfirm } = useAttachFormContext();
	const { setSheet } = useSheetStore();
	const itemId = useSheetStore((s) => s.itemId);

	const { isEndOfCycleSelected } = usePlanScheduleField();

	const previewData = previewQuery.data;
	const confirmLabel = getConfirmLabel({ previewData });

	const isZeroAmount = previewData && previewData.total <= 0;

	const invoiceDisabledReason = isEndOfCycleSelected
		? "Invoices are not available for end of cycle changes as there is no immediate charge to invoice"
		: isZeroAmount
			? "Cannot send an invoice for $0 amounts. Please confirm the change instead."
			: null;

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
								onClick={() =>
									setSheet({ type: "attach-send-invoice", itemId })
								}
							>
								Send an Invoice
							</Button>
						</span>
					</TooltipTrigger>
					{invoiceDisabledReason && (
						<TooltipContent
							side="top"
							className="max-w-(--radix-tooltip-trigger-width)"
						>
							{invoiceDisabledReason}
						</TooltipContent>
					)}
				</Tooltip>
				<Button
					variant="primary"
					className="w-full"
					onClick={() => {
						if (previewData?.redirect_to_checkout) {
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
