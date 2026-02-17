import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton section matching PlanGroupSection structure */
function PlanGroupSectionSkeleton({ showRightText = false }: { showRightText?: boolean }) {
	return (
		<div className="flex flex-col gap-1">
			{/* Header: plan name + optional period/cancelling text */}
			<div className="flex items-center justify-between gap-2">
				<Skeleton className="h-3.5 w-1/3" />
				{showRightText && <Skeleton className="h-3 w-2/5" />}
			</div>

			{/* Line items */}
			<div className="flex flex-col">
				<div className="flex items-center justify-between py-0.5">
					<Skeleton className="h-3.5 w-20" />
					<Skeleton className="h-3.5 w-14" />
				</div>
			</div>
		</div>
	);
}

/** Skeleton matching OrderSummary layout */
export function OrderSummarySkeleton() {
	return (
		<div className="flex flex-col gap-4">
			<PlanGroupSectionSkeleton showRightText />
			<PlanGroupSectionSkeleton showRightText />
		</div>
	);
}
