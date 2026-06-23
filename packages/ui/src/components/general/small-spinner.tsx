import { cn } from "@autumn/ui/lib/utils";
import { LucideLoaderCircle } from "lucide-react";

export function SmallSpinner({
	size = 18,
	className,
}: {
	size?: number;
	className?: string;
}) {
	return (
		<LucideLoaderCircle className={cn("animate-spin", className)} size={size} />
	);
}
