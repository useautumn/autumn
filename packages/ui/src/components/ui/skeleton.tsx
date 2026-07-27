import { cn } from "@autumn/ui/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			className={cn("bg-accent animate-pulse rounded-lg", className)}
			{...props}
		/>
	);
}

export { Skeleton };
