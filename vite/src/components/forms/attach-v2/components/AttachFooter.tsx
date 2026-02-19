import { AnimatePresence, motion } from "motion/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { usePlanScheduleField } from "../hooks/usePlanScheduleField";
import { AttachFooterSkeleton } from "./AttachPreviewSkeleton";

export function AttachFooter() {
	const {
		isPending,
		previewQuery,
		handleConfirm,
		handleInvoiceAttach,
		formValues,
	} = useAttachFormContext();

	const { org } = useOrg();
	const ownStripeAccount = org?.stripe_connection !== "default";
	const { isEndOfCycleSelected } = usePlanScheduleField();

	const invoiceDisabledReason = isEndOfCycleSelected
		? "Invoices are not available for end of cycle changes as there is no immediate charge to invoice"
		: !ownStripeAccount
			? "Connect your own Stripe account to send invoices"
			: null;

	const hasProductSelected = !!formValues.productId;
	const isLoading = previewQuery.isLoading;
	const hasError = !!previewQuery.error;
	const previewData = previewQuery.data;
	const isReady =
		hasProductSelected && !isLoading && !hasError && !!previewData;
	const showSkeleton = hasProductSelected && isLoading;

	if (!isReady && !showSkeleton) return null;

	return (
		<SheetFooter className="flex flex-col grid-cols-1 mt-0">
			<AnimatePresence mode="wait">
				{showSkeleton ? (
					<motion.div
						key="footer-skeleton"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{
							opacity: 0,
							transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
						}}
						transition={{ opacity: { duration: 0.25 } }}
						className="w-full"
					>
						<AttachFooterSkeleton />
					</motion.div>
				) : (
					<motion.div
						key="footer-content"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{
							opacity: 0,
							transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
						}}
						transition={{ opacity: { duration: 0.25, delay: 0.05 } }}
						className="flex flex-col gap-2 w-full"
					>
						<Tooltip>
							<TooltipTrigger asChild>
								<span
									className={cn(
										"flex w-full",
										invoiceDisabledReason && "cursor-not-allowed",
									)}
								>
									<Popover>
										<PopoverTrigger asChild>
											<Button
												variant="secondary"
												className={cn(
													"w-full",
													invoiceDisabledReason &&
														"pointer-events-none opacity-50",
												)}
												disabled={!invoiceDisabledReason && isPending}
											>
												Send an Invoice
											</Button>
										</PopoverTrigger>
										{!invoiceDisabledReason && (
											<PopoverContent className="w-(--radix-popover-trigger-width) p-0">
												<div className="flex flex-col">
													<button
														type="button"
														onClick={() =>
															handleInvoiceAttach({
																enableProductImmediately: true,
															})
														}
														className="px-4 py-3 text-left text-sm hover:bg-accent"
													>
														<div className="font-medium">
															Enable plan immediately
														</div>
														<div className="text-xs text-muted-foreground">
															Enable the plan immediately and redirect to Stripe
															to finalize the invoice
														</div>
													</button>
													<button
														type="button"
														onClick={() =>
															handleInvoiceAttach({
																enableProductImmediately: false,
															})
														}
														className="px-4 py-3 text-left text-sm hover:bg-accent border-t"
													>
														<div className="font-medium">
															Enable plan after payment
														</div>
														<div className="text-xs text-muted-foreground">
															Generate an invoice link for the customer. The
															plan will be enabled after they pay the invoice
														</div>
													</button>
												</div>
											</PopoverContent>
										)}
									</Popover>
								</span>
							</TooltipTrigger>
							{invoiceDisabledReason && (
								<TooltipContent side="top" className="max-w-(--radix-tooltip-trigger-width)">
									{invoiceDisabledReason}
								</TooltipContent>
							)}
						</Tooltip>
						<Button
							variant="primary"
							className="w-full"
							onClick={handleConfirm}
							isLoading={isPending}
						>
							Attach Product
						</Button>
					</motion.div>
				)}
			</AnimatePresence>
		</SheetFooter>
	);
}
