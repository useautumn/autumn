import { AnimatePresence, motion } from "motion/react";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { Button } from "@/components/v2/buttons/Button";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";
import { SHEET_ANIMATION } from "@/views/products/plan/planAnimations";

export function UncancelFooter() {
	const { isPending, previewQuery, handleConfirm } =
		useUpdateSubscriptionFormContext();

	const isLoading = previewQuery.isLoading;
	const hasError = !!previewQuery.error;
	const shouldShow = !isLoading && !hasError;

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
							variant="primary"
							className="w-full"
							onClick={handleConfirm}
							isLoading={isPending}
						>
							Uncancel Subscription
						</Button>
					</SheetFooter>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
