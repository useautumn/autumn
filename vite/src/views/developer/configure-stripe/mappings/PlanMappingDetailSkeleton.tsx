import { Skeleton } from "@autumn/ui";

export const PlanMappingDetailSkeleton = () => (
	<div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center gap-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="ml-auto h-5 w-16" />
			</div>
			<Skeleton className="h-input w-full" />
		</div>
	</div>
);
