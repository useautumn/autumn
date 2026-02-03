import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton that matches PlanGroupCard structure */
export function PlanGroupCardSkeleton() {
	return (
		<div className="rounded-lg border border-border overflow-hidden">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 border-b bg-background/50">
				<div className="flex items-center gap-2">
					<Skeleton className="h-4 w-4" />
					<Skeleton className="h-4 w-24" />
				</div>
				<Skeleton className="h-4 w-16" />
			</div>
			{/* Line item */}
			<div className="px-3 py-2.5">
				<div className="flex items-center justify-between">
					<Skeleton className="h-4 w-20" />
					<Skeleton className="h-4 w-12" />
				</div>
			</div>
		</div>
	);
}
