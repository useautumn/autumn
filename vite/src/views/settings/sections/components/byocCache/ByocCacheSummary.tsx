import type { ApiByocCache } from "@autumn/shared";
import { CopyButton } from "@autumn/ui";
import { format } from "date-fns";

export const ByocCacheSummary = ({ cache }: { cache: ApiByocCache }) => (
	<dl className="flex flex-col text-sm">
		<div className="flex items-center gap-3 py-1.5">
			<dt className="w-32 shrink-0 text-tertiary-foreground">Environment</dt>
			<dd className="capitalize text-foreground">{cache.env}</dd>
		</div>
		{cache.deployment_id && (
			<div className="flex items-center gap-3 py-1.5">
				<dt className="w-32 shrink-0 text-tertiary-foreground">Deployment</dt>
				<dd className="flex min-w-0 items-center gap-2">
					<span className="min-w-0 break-all font-mono text-xs text-foreground">
						{cache.deployment_id}
					</span>
					<CopyButton
						text={cache.deployment_id}
						aria-label="Copy deployment ID"
						className="shrink-0"
					>
						Copy
					</CopyButton>
				</dd>
			</div>
		)}
		<div className="flex items-center gap-3 py-1.5 last:pb-0">
			<dt className="w-32 shrink-0 text-tertiary-foreground">Requested</dt>
			<dd className="text-foreground">
				{format(cache.created_at, "d MMM yyyy, HH:mm")}
			</dd>
		</div>
	</dl>
);
