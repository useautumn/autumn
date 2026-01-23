import { CusProductStatus } from "@autumn/shared";
import { AnimatePresence, motion } from "motion/react";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { Button } from "@/components/v2/buttons/Button";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";
import { SHEET_ANIMATION } from "@/views/products/plan/planAnimations";

export function CancelFooter() {
	const { isPending, previewQuery, handleConfirm, formContext } =
		useUpdateSubscriptionFormContext();
	const { customerProduct } = formContext;

	const isScheduled = customerProduct.status === CusProductStatus.Scheduled;
	const isDefault = customerProduct.product.is_default;

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
							onClick={handleConfirm}
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
