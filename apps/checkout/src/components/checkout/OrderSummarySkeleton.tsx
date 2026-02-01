import { AnimatedLayout } from "@/components/motion/animated-layout";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton that matches OrderSummary layout exactly */
export function OrderSummarySkeleton() {
	return (
		<AnimatedLayout className="flex flex-col" layoutId="order-summary">
			{/* Plan name and billing period */}
			<div className="flex items-center justify-between py-3">
				<Skeleton className="h-5 w-32" />
				<Skeleton className="h-4 w-24" />
			</div>
			<Separator />

			{/* Line items - simulate 3 items */}
			<div className="flex flex-col">
				{/* Base item */}
				<div className="flex items-center justify-between py-3">
					<Skeleton className="h-4 w-20" />
					<Skeleton className="h-4 w-12" />
				</div>
				<Separator />

				{/* Sub-items */}
				{[0, 1].map((i) => (
					<div key={`line-skeleton-${i}`}>
						<div className="flex items-center justify-between py-3">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-4 w-12" />
						</div>
						{i < 1 && <Separator />}
					</div>
				))}

				{/* Total row */}
				<Separator />
				<div className="flex items-center justify-between py-3">
					<Skeleton className="h-4 w-12" />
					<Skeleton className="h-4 w-14" />
				</div>
			</div>
		</AnimatedLayout>
	);
}
