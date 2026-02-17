import { format } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { CrossfadeContainer } from "@/components/motion/CrossfadeContainer";
import { Button } from "@/components/ui/button";
import { useCheckoutContext } from "@/contexts/CheckoutContext";
import { FAST_TRANSITION, STANDARD_TRANSITION, fadeUpVariants } from "@/lib/animations";
import { formatAmount } from "@/utils/formatUtils";
import { BottomSectionSkeleton } from "./BottomSectionSkeleton";
import { CheckoutFooter } from "../layout/CheckoutFooter";

function getButtonText({
	isPending,
	isUpdating,
	total,
	nextCycleTotal,
	isSubscription,
	hasActiveTrial,
}: {
	isPending: boolean;
	isUpdating: boolean;
	total: number;
	nextCycleTotal: number;
	isSubscription: boolean;
	hasActiveTrial: boolean;
}): string {
	if (isPending) return "Processing...";
	if (isUpdating) return "Updating...";
	if (hasActiveTrial) return "Confirm and start trial";
	if (total === 0) {
		return nextCycleTotal > 0 ? "Confirm and Subscribe" : "Confirm";
	}
	return isSubscription ? "Pay and Subscribe" : "Pay";
}

export function ConfirmSection() {
	const {
		status,
		total,
		currency,
		preview,
		isSubscription,
		hasActiveTrial,
		handleConfirm,
	} = useCheckoutContext();

	return (
		<div className="flex flex-col gap-4">
			<motion.div
				variants={fadeUpVariants}
				transition={{ ...STANDARD_TRANSITION, delay: 0.15 }}
			>
				<CrossfadeContainer
					isLoading={status.isLoading}
					skeleton={<BottomSectionSkeleton />}
					className="flex flex-col gap-4"
				>
					{/* Amount summary */}
					<div className="flex flex-col gap-1">
						{/* Amount due today */}
						<div className="flex items-center justify-between">
							<span className="text-sm text-foreground">
								Amount due today
							</span>
							<span className="text-sm font-semibold text-foreground tabular-nums">
								{formatAmount(total, currency)}
							</span>
						</div>

						{/* Amount next cycle / Amount due on trial end */}
						{preview?.next_cycle && (
							<div className="flex flex-col gap-0.5">
								<div className="flex items-center justify-between text-sm text-muted-foreground">
									<span>
										{preview.next_cycle.starts_at
											? `Amount due on ${format(preview.next_cycle.starts_at, "do MMMM yyyy")}`
											: "Total due next cycle"}
									</span>
									<span className="tabular-nums">
										{formatAmount(preview.next_cycle.total, currency)}
									</span>
								</div>
								{/* Credit note explaining reduced next cycle amount */}
								{preview.credit && (
									<span className="text-xs text-muted-foreground/60 text-right">
										Includes {formatAmount(preview.credit.amount, currency)} credit from unused plan
									</span>
								)}
							</div>
						)}
					</div>

					{/* Confirm button */}
					<motion.div
						whileTap={{ scale: 0.98 }}
						transition={FAST_TRANSITION}
						className="pt-4"
					>
						<Button
							className="w-full h-11 text-sm font-medium rounded-lg"
							onClick={handleConfirm}
							disabled={status.isConfirming || status.isUpdating}
						>
							{getButtonText({
								isPending: status.isConfirming,
								isUpdating: status.isUpdating,
								total,
								nextCycleTotal: preview?.next_cycle?.total ?? 0,
								isSubscription,
								hasActiveTrial,
							})}
						</Button>
					</motion.div>

					{/* Error message */}
					<AnimatePresence>
						{status.confirmError && (
							<motion.p
								className="text-sm text-destructive text-center"
								initial={{ opacity: 0, y: -5 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -5 }}
								transition={FAST_TRANSITION}
							>
								{status.confirmError instanceof Error
									? status.confirmError.message
									: "Failed to confirm checkout"}
							</motion.p>
						)}
					</AnimatePresence>
				</CrossfadeContainer>
			</motion.div>

			<motion.div
				variants={fadeUpVariants}
				transition={{ ...STANDARD_TRANSITION, delay: 0.2 }}
			>
				<CheckoutFooter />
			</motion.div>
		</div>
	);
}
