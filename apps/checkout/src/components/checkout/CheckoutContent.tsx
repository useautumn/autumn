import { motion } from "motion/react";
import { Separator } from "@/components/ui/separator";
import { useCheckoutContext } from "@/contexts/CheckoutContext";
import { STANDARD_TRANSITION, fadeUpVariants, listContainerVariants } from "@/lib/animations";
import { ConfirmSection } from "./confirm/ConfirmSection";
import { CheckoutBackground } from "./layout/CheckoutBackground";
import { CheckoutHeader } from "./layout/CheckoutHeader";
import { OrderSummarySection } from "./order-summary/OrderSummarySection";
import { PlanSection } from "./plan/PlanSection";
import { CheckoutErrorState } from "./states/CheckoutErrorState";
import { CheckoutSuccessState } from "./states/CheckoutSuccessState";

export function CheckoutContent() {
	const { confirmResult, status, isSandbox } = useCheckoutContext();

	// Handle success state
	if (confirmResult) {
		return (
			<motion.div
				initial={{ opacity: 0, scale: 0.98 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={STANDARD_TRANSITION}
			>
				<CheckoutSuccessState result={confirmResult} />
			</motion.div>
		);
	}

	// Handle error state
	if (status.error) {
		return (
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={STANDARD_TRANSITION}
			>
				<CheckoutErrorState
					message={
						status.error instanceof Error
							? status.error.message
							: "Failed to load checkout"
					}
				/>
			</motion.div>
		);
	}

	// Main checkout view
	return (
		<CheckoutBackground isSandbox={isSandbox}>
			<motion.div
				className="flex flex-col gap-6 w-full"
				initial="initial"
				animate="animate"
				variants={listContainerVariants}
			>
				{/* Header */}
				<motion.div variants={fadeUpVariants} transition={STANDARD_TRANSITION}>
					<CheckoutHeader />
				</motion.div>

				{/* Main content - single column */}
				<div className="flex flex-col gap-6 w-full">
					<Separator />
					<PlanSection />
					<Separator />
					<OrderSummarySection />
				</div>

				<Separator />

				<ConfirmSection />
			</motion.div>
		</CheckoutBackground>
	);
}
