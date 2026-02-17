import { motion } from "motion/react";
import { CrossfadeContainer } from "@/components/motion/CrossfadeContainer";
import { useCheckoutContext } from "@/contexts/CheckoutContext";
import { FAST_TRANSITION, STANDARD_TRANSITION, fadeUpVariants } from "@/lib/animations";
import { OrderSummary } from "./OrderSummary";
import { OrderSummarySkeleton } from "./OrderSummarySkeleton";
import { SectionHeader } from "../shared/SectionHeader";

export function OrderSummarySection() {
	const { status } = useCheckoutContext();

	return (
		<motion.div
			className="flex flex-col gap-3 w-full"
			variants={fadeUpVariants}
			transition={{ ...STANDARD_TRANSITION, delay: 0.1 }}
		>
			<SectionHeader title="Order Summary" />

			<motion.div
				animate={{ opacity: status.isUpdating ? 0.6 : 1 }}
				transition={FAST_TRANSITION}
			>
				<CrossfadeContainer
					isLoading={status.isLoading}
					skeleton={<OrderSummarySkeleton />}
				>
					<OrderSummary />
				</CrossfadeContainer>
			</motion.div>
		</motion.div>
	);
}
