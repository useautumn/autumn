import { Skeleton } from "@autumn/ui";

const MappingFieldSkeleton = () => (
	<div className="flex flex-col gap-1.5">
		<div className="flex items-center gap-2">
			<Skeleton className="h-4 w-32" />
			<Skeleton className="ml-auto h-5 w-16" />
		</div>
		<Skeleton className="h-input w-full" />
	</div>
);

export const PlanMappingDetailSkeleton = ({
	itemCount,
}: {
	itemCount: number;
}) => (
	<div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
		<div className="flex flex-col gap-2">
			<h3 className="text-sub">Base plan</h3>
			<MappingFieldSkeleton />
		</div>

		{itemCount > 0 && (
			<div className="flex flex-col gap-4">
				<h3 className="text-sub">Item mappings</h3>
				{Array.from({ length: itemCount }).map((_, index) => (
					<MappingFieldSkeleton key={index} />
				))}
			</div>
		)}
	</div>
);
