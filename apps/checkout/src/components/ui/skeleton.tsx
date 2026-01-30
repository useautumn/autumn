import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Use shimmer effect instead of pulse */
	shimmer?: boolean;
}

/**
 * Skeleton loading placeholder with optional shimmer effect.
 * Shimmer provides a Stripe-style loading animation.
 */
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
