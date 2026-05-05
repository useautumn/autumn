import { motion } from "motion/react";
import { Separator } from "@/components/ui/separator";
import { useCheckoutContext } from "@/contexts/CheckoutContext";
import { STANDARD_TRANSITION, fadeUpVariants, listContainerVariants } from "@/lib/animations";
import { checkoutErrorToDisplay } from "@/utils/checkoutErrorUtils";
import { ConfirmSection } from "./confirm/ConfirmSection";
import { CheckoutBackground } from "./layout/CheckoutBackground";
import { CheckoutHeader } from "./layout/CheckoutHeader";
import { OrderSummarySection } from "./order-summary/OrderSummarySection";
import { PlanSection } from "./plan/PlanSection";
import { CheckoutActionRequiredDialog } from "./states/CheckoutActionRequiredDialog";
import { CheckoutErrorState } from "./states/CheckoutErrorState";
import { CheckoutSuccessState } from "./states/CheckoutSuccessState";

export function CheckoutSharedContent() {
	const {
		actionRequiredResponse,
		confirmResult,
		hasActionRequiredState,
		hasAdjustableFeatures,
		status,
		isSandbox,
	} = useCheckoutContext();

	const showPlanSection = status.isLoading || hasAdjustableFeatures;

	if (confirmResult) {
		return (
			<motion.div
				initial={{ opacity: 0, scale: 0.98 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={STANDARD_TRANSITION}
			>
				<CheckoutSuccessState />
			</motion.div>
		);
	}

	if (status.error) {
		const errorDisplay = checkoutErrorToDisplay({
			error: status.error,
		});

		return (
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={STANDARD_TRANSITION}
			>
				<CheckoutErrorState {...errorDisplay} />
			</motion.div>
		);
	}

	return (
		<CheckoutBackground isSandbox={isSandbox}>
			<motion.div
				className="flex flex-col gap-6 w-full"
				initial="initial"
				animate="animate"
				variants={listContainerVariants}
			>
				<motion.div variants={fadeUpVariants} transition={STANDARD_TRANSITION}>
					<CheckoutHeader />
				</motion.div>

				<div className="flex flex-col gap-6 w-full">
					<Separator />
					{showPlanSection && (
						<>
							<PlanSection />
							<Separator />
						</>
					)}
					<OrderSummarySection />
				</div>

				<Separator />

				<ConfirmSection />

				{hasActionRequiredState && actionRequiredResponse && (
					<CheckoutActionRequiredDialog response={actionRequiredResponse} />
				)}
			</motion.div>
		</CheckoutBackground>
	);
}
