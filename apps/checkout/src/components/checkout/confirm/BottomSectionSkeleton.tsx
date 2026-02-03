import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for the bottom section (amount due + confirm button) */
export function BottomSectionSkeleton() {
	return (
		<div className="flex flex-col gap-6">
			{/* Amount summary */}
			<div className="flex flex-col gap-1">
				{/* Amount due today */}
				<div className="flex items-center justify-between">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-5 w-16" />
				</div>
				{/* Total due next cycle */}
				<div className="flex items-center justify-between">
					<Skeleton className="h-3.5 w-28" />
					<Skeleton className="h-3.5 w-14" />
				</div>
			</div>
			{/* Button */}
			<Skeleton className="h-12 w-full rounded-lg" />
		</div>
	);
}
