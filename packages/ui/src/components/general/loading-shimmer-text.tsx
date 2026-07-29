import { SmallSpinner } from "@autumn/ui/components/general/small-spinner";
import { cn } from "@autumn/ui/lib/utils";

interface LoadingShimmerTextProps {
	text: string;
	className?: string;
}

export function LoadingShimmerText({
	text,
	className,
}: LoadingShimmerTextProps) {
	return (
		<div className={cn("flex items-center justify-start gap-2", className)}>
			<SmallSpinner size={12} className="text-tertiary-foreground" />
			<span className="text-sm shimmer">{text}</span>
		</div>
	);
}
