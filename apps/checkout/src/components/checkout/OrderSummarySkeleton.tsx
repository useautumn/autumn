import { CyclingSkeletonList } from "@/components/motion/CyclingSkeletonList";
import { PlanGroupCardSkeleton } from "@/components/checkout/PlanGroupCardSkeleton";

/** Skeleton that matches OrderSummary layout with cycling item count */
export function OrderSummarySkeleton() {
	return (
		<CyclingSkeletonList
			renderItem={(index) => <PlanGroupCardSkeleton key={index} />}
			minItems={1}
			maxItems={2}
		/>
	);
}
