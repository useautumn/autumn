import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton that matches FreeTrialCard structure */
export function FreeTrialCardSkeleton() {
	return (
		<div className="rounded-lg border border-border overflow-hidden">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 border-b bg-background/50">
				<div className="flex items-center gap-2">
					<Skeleton className="h-4 w-4" />
					<Skeleton className="h-4 w-20" />
				</div>
				<Skeleton className="h-4 w-14" />
			</div>
			{/* Content */}
			<div className="px-3 py-2.5 space-y-1.5">
				<Skeleton className="h-4 w-48" />
				<Skeleton className="h-3 w-36" />
			</div>
		</div>
	);
}
