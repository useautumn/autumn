import SmallSpinner from "@/components/general/SmallSpinner";
import { cn } from "@/lib/utils";

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
			<SmallSpinner size={12} className="text-t3" />
			<span className="text-sm shimmer">{text}</span>
		</div>
	);
}
