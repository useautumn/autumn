import { RolloutFlipStatus } from "./RolloutFlipStatus";
import { RolloutPercentForm } from "./RolloutPercentForm";
import type { RolloutPercent } from "./rolloutTypes";

/** The global percent as a number you can read at a glance, with its control beside it. */
export const RolloutGlobalControl = ({
	rollout,
	settleMs,
	onApply,
	isSaving,
}: {
	rollout: RolloutPercent;
	settleMs: number;
	onApply: ({ percent }: { percent: number }) => void;
	isSaving: boolean;
}) => (
	<div className="flex flex-col gap-5 rounded-lg border bg-interactive-secondary p-5">
		<div className="flex flex-wrap items-end justify-between gap-4">
			<div className="flex flex-col gap-1">
				<div className="flex items-baseline gap-2">
					<span className="font-mono text-4xl font-semibold tabular-nums leading-none text-foreground">
						{rollout.percent}
					</span>
					<span className="text-lg text-tertiary-foreground">%</span>
				</div>
				<span className="text-sm text-tertiary-foreground">
					of customer buckets on the worker
				</span>
			</div>
			<RolloutPercentForm
				current={rollout.percent}
				onApply={onApply}
				isSaving={isSaving}
			/>
		</div>
		<div className="flex items-center gap-4">
			<div className="h-1 flex-1 overflow-clip rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
					style={{ width: `${rollout.percent}%` }}
				/>
			</div>
			<RolloutFlipStatus rollout={rollout} settleMs={settleMs} />
		</div>
	</div>
);
