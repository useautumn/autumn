import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

const FOOTER_DELAY_MS = 350;

export function UpdateSubscriptionFooter() {
	const { isPending, hasChanges, previewQuery, handleConfirm } =
		useUpdateSubscriptionFormContext();
	const { setSheet } = useSheetStore();
	const itemId = useSheetStore((s) => s.itemId);

	const isLoading = previewQuery.isLoading;
	const hasError = !!previewQuery.error;
	const isReady = hasChanges && !isLoading && !hasError;

	const previewData = previewQuery.data;
	const isZeroAmount = previewData && previewData.total <= 0;

	const invoiceDisabledReason = isZeroAmount
		? "Cannot send an invoice for $0 amounts. Please confirm the change instead."
		: null;

	const [showFooter, setShowFooter] = useState(false);

	useEffect(() => {
		if (isReady) {
			const timer = setTimeout(() => setShowFooter(true), FOOTER_DELAY_MS);
			return () => clearTimeout(timer);
		}
		setShowFooter(false);
	}, [isReady]);

	if (!showFooter) return null;

	return (
		<SheetFooter className="flex flex-col grid-cols-1 mt-0">
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.2 }}
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
							<Button
								variant="secondary"
								className={cn(
									"w-full",
									invoiceDisabledReason && "pointer-events-none opacity-50",
								)}
								disabled={!invoiceDisabledReason && isPending}
								onClick={() =>
									setSheet({
										type: "subscription-update-send-invoice",
										itemId,
									})
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
					onClick={handleConfirm}
					isLoading={isPending}
				>
					Confirm Update
				</Button>
			</motion.div>
		</SheetFooter>
	);
}
