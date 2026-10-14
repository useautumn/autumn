import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
	shimmer?: boolean;
}

function Skeleton({ className, shimmer = true, ...props }: SkeletonProps) {
	return (
		<div
			className={cn(
				"rounded-md bg-muted relative overflow-hidden",
				shimmer && "skeleton-shimmer",
				!shimmer && "animate-pulse",
				className,
			)}
			{...props}
		/>
	);
}

export { Skeleton };
