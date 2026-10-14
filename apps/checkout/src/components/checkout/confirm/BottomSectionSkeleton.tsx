import { Skeleton } from "@/components/ui/skeleton";

export function BottomSectionSkeleton() {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<div className="flex items-center justify-between">
					<Skeleton className="h-3.5 w-28" />
					<Skeleton className="h-3.5 w-14" />
				</div>
				<div className="flex items-center justify-between">
					<Skeleton className="h-3.5 w-44" />
					<Skeleton className="h-3.5 w-16" />
				</div>
			</div>

			<div className="pt-4">
				<Skeleton className="h-11 w-full rounded-lg" />
			</div>
		</div>
	);
}
