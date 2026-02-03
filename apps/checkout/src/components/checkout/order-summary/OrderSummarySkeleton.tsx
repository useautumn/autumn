import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton section that matches PlanGroupSection structure */
function PlanGroupSectionSkeleton() {
	return (
		<div>
		{/* Header */}
		<div className="flex items-center justify-between px-3 py-2.5 border-b bg-background/50">
				<div className="flex items-center gap-2">
					<Skeleton className="h-4 w-4" />
					<Skeleton className="h-4 w-24" />
				</div>
				<Skeleton className="h-4 w-16" />
			</div>
		{/* Line item */}
		<div className="px-3 py-2">
				<div className="flex items-center justify-between gap-4">
					<div className="flex flex-col gap-1.5 min-w-0">
						<Skeleton className="h-2.5 w-20" />
						<Skeleton className="h-2 w-32" />
					</div>
					<Skeleton className="h-2.5 w-12 shrink-0" />
				</div>
			</div>
		</div>
	);
}

/** Skeleton that matches OrderSummary unified card layout */
export function OrderSummarySkeleton() {
	return (
		<div className="rounded-lg border border-border overflow-hidden">
			{/* First plan section */}
			<PlanGroupSectionSkeleton />
			<Separator />
			{/* Second plan section */}
			<PlanGroupSectionSkeleton />
		</div>
	);
}
