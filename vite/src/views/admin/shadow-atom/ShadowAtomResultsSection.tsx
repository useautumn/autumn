import { cn } from "@autumn/ui/lib/utils";
import { useState } from "react";
import { RolloutSection } from "../edge-config/RolloutSection";
import { ShadowAtomResultsTable } from "./ShadowAtomResultsTable";
import {
	SHADOW_ATOM_RESULT_RANGES,
	type ShadowAtomEnv,
	type ShadowAtomResultRange,
} from "./shadowAtomTypes";
import { useShadowAtomResults } from "./useShadowAtomResults";

const RangeToggle = ({
	value,
	onChange,
}: {
	value: ShadowAtomResultRange;
	onChange: (range: ShadowAtomResultRange) => void;
}) => (
	<div className="flex overflow-clip rounded-md border">
		{SHADOW_ATOM_RESULT_RANGES.map((range) => (
			<button
				type="button"
				key={range}
				onClick={() => onChange(range)}
				aria-pressed={value === range}
				className={cn(
					"h-7 border-r px-2.5 text-xs last:border-r-0",
					value === range
						? "bg-primary/10 text-foreground"
						: "text-tertiary-foreground hover:text-foreground",
				)}
			>
				{range}
			</button>
		))}
	</div>
);

export const ShadowAtomResultsSection = ({ env }: { env: ShadowAtomEnv }) => {
	const [range, setRange] = useState<ShadowAtomResultRange>("1h");
	const results = useShadowAtomResults({ env, range });

	return (
		<RolloutSection
			title="Shadow results"
			description="From the API's atom_shadow_check log lines: match rate of answered checks, p50/p99 latency per org."
			actions={<RangeToggle value={range} onChange={setRange} />}
		>
			{results.data ? (
				<ShadowAtomResultsTable results={results.data} />
			) : (
				<div className="h-24 animate-pulse rounded-lg bg-muted" />
			)}
		</RolloutSection>
	);
};
