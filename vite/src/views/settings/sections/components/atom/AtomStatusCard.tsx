import type { ApiByocCache } from "@autumn/shared";
import { cn } from "@/lib/utils";
import { AtomSummary } from "./AtomSummary";
import { ATOM_STATUS_DISPLAY } from "./atomStatusDisplay";

export const AtomStatusCard = ({
	cache,
	actions,
}: {
	cache: ApiByocCache;
	actions: React.ReactNode;
}) => {
	const display = ATOM_STATUS_DISPLAY[cache.status];

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

			<AtomSummary cache={cache} />

			<div className="flex flex-wrap items-center gap-2">{actions}</div>
		</div>
	);
};
