import type { ApiByocCache } from "@autumn/shared";
import { cn } from "@/lib/utils";
import { ByocCacheSummary } from "./ByocCacheSummary";
import { BYOC_CACHE_STATUS_DISPLAY } from "./byocCacheStatusDisplay";

export const ByocCacheStatusCard = ({
	cache,
	actions,
}: {
	cache: ApiByocCache;
	actions: React.ReactNode;
}) => {
	const display = BYOC_CACHE_STATUS_DISPLAY[cache.status];

	return (
		<div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2" aria-live="polite">
					<span
						aria-hidden="true"
						className={cn("size-2 shrink-0 rounded-full", display.dotClassName)}
					/>
					<span className="text-sm font-medium text-foreground">
						{display.label}
					</span>
				</div>
				<p className="text-sm text-tertiary-foreground">
					{display.description}
				</p>
			</div>

			<ByocCacheSummary cache={cache} />

			<div className="flex flex-wrap items-center gap-2">{actions}</div>
		</div>
	);
};
