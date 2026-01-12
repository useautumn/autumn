import { LucideLoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function SmallSpinner({ size = 18, className }: { size?: number; className?: string }) {
	return (
		<LucideLoaderCircle
			className={cn("animate-spin", className)}
			size={size}
		/>
	);
}

export default SmallSpinner;
