import { motion } from "motion/react";
import { CrossfadeContainer } from "@/components/motion/CrossfadeContainer";
import { useCheckoutContext } from "@/contexts/CheckoutContext";
import { STANDARD_TRANSITION, fadeUpVariants } from "@/lib/animations";
import { PlanSelectionCard } from "./PlanSelectionCard";
import { PlanSelectionCardSkeleton } from "./PlanSelectionCardSkeleton";
import { SectionHeader } from "../shared/SectionHeader";

export function PlanSection() {
	const { incoming, status } = useCheckoutContext();

	return (
		<motion.div
			className="flex flex-col gap-4 w-full lg:flex-1 min-w-0"
			variants={fadeUpVariants}
			transition={{ ...STANDARD_TRANSITION, delay: 0.05 }}
		>
			<SectionHeader title="Plan Details" />

			<CrossfadeContainer
				isLoading={status.isLoading}
				skeleton={<PlanSelectionCardSkeleton />}
			>
				{incoming?.map((change) => (
					<PlanSelectionCard key={change.plan.id} change={change} />
				))}
			</CrossfadeContainer>
		</motion.div>
	);
}
