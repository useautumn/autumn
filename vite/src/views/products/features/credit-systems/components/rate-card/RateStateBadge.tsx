import { Badge } from "@autumn/ui";
import { cn } from "@/lib/utils";

export function RateStateBadge({
	label,
	muted = false,
}: {
	label: string;
	muted?: boolean;
}) {
	return (
		<Badge
			variant="muted"
			className={cn(
				"shrink-0 font-medium",
				muted ? "text-tertiary-foreground" : "text-foreground",
			)}
		>
			{label}
		</Badge>
	);
}
