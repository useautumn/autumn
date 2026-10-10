import { Badge } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { splitEndpoint } from "./rateLimitEndpoints";

/** The method as a tag, then the path; long paths wrap on phones and truncate from `md`. */
export const RateLimitEndpointLabel = ({
	endpoint,
	className,
}: {
	endpoint: string;
	className?: string;
}) => {
	const { method, path } = splitEndpoint(endpoint);
	return (
		<span
			title={endpoint}
			className={cn("flex min-w-0 items-center gap-2", className)}
		>
			<Badge variant="muted" size="sm" className="shrink-0 font-mono">
				{method}
			</Badge>
			<span className="min-w-0 break-all font-mono text-xs text-foreground md:truncate">
				{path}
			</span>
		</span>
	);
};
