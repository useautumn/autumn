import { CusProductStatus, cp } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";

const FOOTER_DELAY_MS = 350;

export function CancelFooter() {
	const { isPending, previewQuery, handleConfirm, formContext } =
		useUpdateSubscriptionFormContext();
	const { customerProduct } = formContext;

	const isScheduled = customerProduct.status === CusProductStatus.Scheduled;
	const isDefault = customerProduct.product?.is_default ?? false;
	const { valid: isFreeOrOneOff } = cp(customerProduct).free().or.oneOff();
	const isFreeDefault = isDefault && isFreeOrOneOff;

	const isLoading = previewQuery.isLoading;
	const hasError = !!previewQuery.error;
	const isReady = !isLoading && !hasError;

	const [showFooter, setShowFooter] = useState(false);

	useEffect(() => {
		if (isReady) {
			const timer = setTimeout(() => setShowFooter(true), FOOTER_DELAY_MS);
			return () => clearTimeout(timer);
		}
		setShowFooter(false);
	}, [isReady]);

	if (!showFooter) return null;

	const buttonLabel = isScheduled
		? "Cancel Scheduled Plan"
		: isFreeDefault
			? "Cancel Default Plan"
			: "Cancel Subscription";

	return (
		<SheetFooter className="grid-cols-1">
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.2 }}
			>
				<Button
					variant="destructive"
					className="w-full"
					onClick={handleConfirm}
					isLoading={isPending}
				>
					{buttonLabel}
				</Button>
			</motion.div>
		</SheetFooter>
	);
}
