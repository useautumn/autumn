import type { RunDetail } from "../../../../src/api/contract.ts";
import { roundEta } from "../../../../src/internal/runs/eta/smoothEta.ts";
import { Tooltip } from "../../components/ui.tsx";
import { formatMs } from "../../lib/format.ts";
import { useSmoothedEta } from "../../lib/useSmoothedEta.ts";

const ESTIMATING = new Set(["provisioning", "running", "tearing_down"]);

/** "~4m left (p90 6m)" next to the progress counts; "estimating…" until ~5 files finish. */
export const RunEta = ({ run, now }: { run: RunDetail; now: number }) => {
	const eta = useSmoothedEta({
		etaMs: run.etaMs,
		etaP90Ms: run.etaP90Ms,
		now,
	});
	if (!ESTIMATING.has(run.status)) return null;
	if (!eta) return <span className="text-subtle">estimating…</span>;
	return (
		<Tooltip content="Dev baselines scaled by this run's pace, packed onto its workers, plus retries and teardown. p90 is the slow case.">
			<span>
				~
				<span className="font-medium text-foreground">
					{formatMs(roundEta(eta.etaMs))}
				</span>{" "}
				left{" "}
				<span className="text-subtle">
					(p90 {formatMs(roundEta(eta.etaP90Ms))})
				</span>
			</span>
		</Tooltip>
	);
};
