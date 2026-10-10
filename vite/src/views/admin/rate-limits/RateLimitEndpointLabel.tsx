import { Badge } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { Fragment } from "react";
import { splitEndpoint } from "./rateLimitEndpoints";

/** The method as a tag, then the path; on phones it wraps after `/` and `.`, from `md` it truncates. */
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
			<span className="min-w-0 font-mono text-xs text-foreground md:truncate">
				{path.split(/(?<=[/.])/).map((segment, index) => (
					<Fragment key={index}>
						{segment}
						<wbr />
					</Fragment>
				))}
			</span>
		</span>
	);
};
