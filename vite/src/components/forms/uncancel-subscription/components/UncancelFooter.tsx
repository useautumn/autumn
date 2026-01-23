import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { Button } from "@/components/v2/buttons/Button";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";

const FOOTER_DELAY_MS = 350;

export function UncancelFooter() {
	const { isPending, previewQuery, handleConfirm } =
		useUpdateSubscriptionFormContext();

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

	return (
		<SheetFooter className="grid-cols-1">
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.2 }}
			>
				<Button
					variant="primary"
					className="w-full"
					onClick={handleConfirm}
					isLoading={isPending}
				>
					Uncancel Subscription
				</Button>
			</motion.div>
		</SheetFooter>
	);
}
