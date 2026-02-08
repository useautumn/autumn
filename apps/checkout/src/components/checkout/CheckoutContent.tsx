import { LayoutGroup, motion } from "motion/react";
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
				className="flex flex-col gap-8 w-full"
				initial="initial"
				animate="animate"
				variants={listContainerVariants}
			>
				{/* Header */}
				<motion.div variants={fadeUpVariants} transition={STANDARD_TRANSITION}>
					<CheckoutHeader />
				</motion.div>

				{/* Main content - two columns */}
				<LayoutGroup>
					<div className="flex flex-col lg:flex-row gap-8 w-full max-w-4xl mx-auto">
						<PlanSection />

						{/* Vertical separator - visible only on desktop */}
						<Separator
							orientation="vertical"
							className="hidden lg:block h-auto self-stretch"
						/>
						<Separator
							orientation="horizontal"
							className="block lg:hidden h-auto self-stretch"
						/>

						<OrderSummarySection />
					</div>
				</LayoutGroup>

				<Separator />

				<ConfirmSection />
			</motion.div>
		</CheckoutBackground>
	);
}
