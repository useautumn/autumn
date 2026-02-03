import { CardBackground } from "@/components/checkout/CardBackground";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton that matches PlanSelectionCard layout */
export function PlanSelectionCardSkeleton() {
	return (
		<Card className="py-0 gap-0 flex-1">
			<CardBackground>
				{/* Plan header */}
				<div className="flex items-center px-3 py-2.5 border-b bg-background/50">
					<div className="flex items-center gap-2">
						<Skeleton className="h-4 w-4" />
						<Skeleton className="h-4 w-32" />
					</div>
				</div>

				{/* Feature rows - 2 rows for a balanced skeleton */}
				{[0, 1].map((i) => (
					<div key={`feature-skeleton-${i}`}>
						{i > 0 && (
							<div className="px-3">
								<Separator />
							</div>
						)}
						<div className="flex items-center justify-between px-3 py-2">
							<div className="flex items-center gap-2">
								<Skeleton className="h-4 w-4" />
								<Skeleton className="h-4 w-24" />
							</div>
						</div>
					</div>
				))}
			</CardBackground>
		</Card>
	);
}
