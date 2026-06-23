import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";

export function BetaBadge({ className }: { className?: string }) {
	return (
		<Badge
			className={cn(
				"bg-blue-500/10! text-blue-600! dark:text-blue-400! border-blue-500/20! shadow-none! font-mono text-[10px]! px-1.5 py-0",
				className,
			)}
		>
			BETA
		</Badge>
	);
}
