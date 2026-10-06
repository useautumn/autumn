import type { Drift } from "../../../../src/api/contract.ts";
import { Pill } from "../../components/status.tsx";
import { Tooltip } from "../../components/ui.tsx";
import { formatMs } from "../../lib/format.ts";

export const NEW_FAILURE_PILL =
	"border border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40";

/** "new failure" (passes on dev) or "N× slower" (than dev p90). */
export const DriftBadge = ({ drift }: { drift: Drift }) =>
	drift.kind === "new_failure" ? (
		<Tooltip
			content={`Passes ${Math.round(drift.baselineValue * 100)}% of the time on dev`}
		>
			<span className="flex shrink-0">
				<Pill tone="bad" className={NEW_FAILURE_PILL}>
					new failure
				</Pill>
			</span>
		</Tooltip>
	) : (
		<Tooltip
			content={`${formatMs(drift.branchValue)} here vs ${formatMs(drift.baselineValue)} dev p90`}
		>
			<span className="flex shrink-0">
				<Pill tone="warn">
					{(drift.branchValue / drift.baselineValue).toFixed(1)}× slower
				</Pill>
			</span>
		</Tooltip>
	);
