import { AnimatedCard } from "@/components/motion/animated-layout";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton that matches PlanSelectionCard layout exactly */
export function PlanSelectionCardSkeleton() {
	return (
		<AnimatedCard layoutId="plan-selection-card">
			<Card className="py-0 gap-0 flex-1">
			{/* Plan header - matches real component */}
			<div className="flex items-center justify-between px-4 py-4">
				<Skeleton className="h-5 w-32" />
				<Skeleton className="h-5 w-24" />
			</div>

			{/* Feature rows - simulate 4 features */}
			{[0, 1, 2, 3].map((i) => (
				<div key={`feature-skeleton-${i}`}>
					<div className="px-4">
						<Separator className="w-auto" />
					</div>
					<div className="flex items-center justify-between px-4 py-3">
						<div className="flex items-center gap-3">
							<Skeleton className="h-4 w-4" />
							<Skeleton className="h-4 w-24" />
						</div>
						<Skeleton className="h-4 w-20" />
					</div>
				</div>
			))}

			{/* Prepaid feature row with quantity input */}
			<div className="px-4">
				<Separator className="w-auto" />
			</div>
			<div className="flex items-center justify-between px-4 py-4">
				<div className="flex flex-col gap-1">
					<Skeleton className="h-5 w-20" />
					<Skeleton className="h-4 w-28" />
				</div>
				<div className="flex items-center gap-4">
					<Skeleton className="h-5 w-16" />
					<Skeleton className="h-9 w-28 rounded-md" />
				</div>
			</div>
		</Card>
		</AnimatedCard>
	);
}
