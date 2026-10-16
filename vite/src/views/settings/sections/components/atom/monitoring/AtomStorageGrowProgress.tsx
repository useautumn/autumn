import { BYOC_CACHE_REPLICAS } from "@autumn/shared";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { AtomStorageGrowth } from "./atomStorageGrowth";

const STEPS = ["requested", "growing"] as const;

const stepLabel = ({
	step,
	growth,
}: {
	step: (typeof STEPS)[number];
	growth: Exclude<AtomStorageGrowth, { phase: "failed" }>;
}) => {
	if (step === "requested") return "Requested";
	return `Growing volumes (${growth.grownReplicas}/${BYOC_CACHE_REPLICAS} replicas)`;
};

/** A running grow as its steps, the current one lit, or why it failed. */
export const AtomStorageGrowProgress = ({
	growth,
}: {
	growth: AtomStorageGrowth;
}) => {
	if (growth.phase === "failed")
		return (
			<p className="text-sm text-destructive">
				Growing to {growth.targetGib} GiB failed at {format(growth.at, "HH:mm")}
				{growth.error && ` · ${growth.error}`}
			</p>
		);
	const current = STEPS.indexOf(growth.phase);
	return (
		<div className="flex items-center justify-between gap-4 text-sm">
			<span className="flex flex-wrap items-center gap-x-2">
				{STEPS.map((step, index) => (
					<span key={step} className="flex items-center gap-2">
						{index > 0 && <span className="text-subtle">→</span>}
						<span
							className={cn(
								index > current && "text-subtle",
								index < current && "text-tertiary-foreground",
								index === current && "font-medium text-foreground",
							)}
						>
							{stepLabel({ step, growth })}
						</span>
					</span>
				))}
			</span>
			<span className="shrink-0 font-mono text-xs text-subtle">
				{format(growth.at, "HH:mm")}
			</span>
		</div>
	);
};
