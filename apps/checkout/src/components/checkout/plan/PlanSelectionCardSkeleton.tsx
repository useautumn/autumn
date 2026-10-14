import { Skeleton } from "@/components/ui/skeleton";

export function PlanSelectionCardSkeleton() {
	return (
		<div className="flex flex-col gap-1">
			<Skeleton className="h-3.5 w-2/5" />

			<div className="flex items-center justify-between gap-4 py-0.5">
				<div className="flex flex-col gap-1 min-w-0">
					<Skeleton className="h-3.5 w-20" />
					<Skeleton className="h-3 w-28" />
				</div>

				<div className="flex items-center gap-3 shrink-0">
					<Skeleton className="h-3.5 w-20" />
					<Skeleton className="h-6 w-[88px]" />
				</div>
			</div>
		</div>
	);
}
