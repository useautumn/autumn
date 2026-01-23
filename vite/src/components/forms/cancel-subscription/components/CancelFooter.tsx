import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/v2/buttons/Button";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";
import { SHEET_ANIMATION } from "@/views/products/plan/planAnimations";
import { useCancelSubscriptionContext } from "../context/CancelSubscriptionContext";

export function CancelFooter() {
	const { isPending, previewQuery, handleCancel, isScheduled, isDefault } =
		useCancelSubscriptionContext();

	const isLoading = previewQuery.isLoading;
	const hasError = !!previewQuery.error;
	const shouldShow = !isLoading && !hasError;

	const buttonLabel = isScheduled
		? "Cancel Scheduled Plan"
		: isDefault
			? "Cancel Default Plan"
			: "Cancel Subscription";

	return (
		<AnimatePresence mode="wait">
			{shouldShow && (
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 20 }}
					transition={SHEET_ANIMATION}
				>
					<SheetFooter className="grid-cols-1">
						<Button
							variant="destructive"
							className="w-full"
							onClick={handleCancel}
							isLoading={isPending}
						>
							{buttonLabel}
						</Button>
					</SheetFooter>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
