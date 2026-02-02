import { AnimatedLayout } from "@/components/motion/animated-layout";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton that matches OrderSummary layout exactly */
export function OrderSummarySkeleton() {
	return (
		<AnimatedLayout className="flex flex-col gap-4" layoutId="order-summary">
			{/* Plan group card skeleton */}
			<Card className="py-0 gap-0">
				{/* Plan name header */}
				<div className="flex items-center justify-between px-4 py-3">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-4 w-16" />
				</div>

				{/* Line items */}
				{[0, 1].map((i) => (
					<div key={`line-skeleton-${i}`}>
						<div className="px-4">
							<Separator />
						</div>
						<div className="flex items-center justify-between px-4 py-3">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-4 w-12" />
						</div>
					</div>
				))}
			</Card>

			{/* Total row */}
			<div className="flex items-center justify-between pt-2 border-t border-border">
				<Skeleton className="h-4 w-12" />
				<Skeleton className="h-4 w-14" />
			</div>
		</AnimatedLayout>
	);
}
