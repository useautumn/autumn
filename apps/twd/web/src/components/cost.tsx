import type { Costs, RunCost } from "../../../src/api/contract.ts";
import { cn, formatMs, num, usd } from "../lib/format.ts";
import { StatusDot } from "./status.tsx";
import { Tooltip } from "./ui.tsx";

type CostRates = Costs["rates"];

export const workerUsdPerSecond = (rates: CostRates) =>
	(rates.workerCores * rates.usdPerCoreSecond +
		rates.workerMemoryGib * rates.usdPerGibSecond) *
	rates.regionMultiplier;

export const RatesLine = ({ rates }: { rates: CostRates }) => (
	<span className="block text-tertiary-foreground tabular-nums">
		({rates.workerCores} cores × ${rates.usdPerCoreSecond}/core·s +{" "}
		{rates.workerMemoryGib} GiB × ${rates.usdPerGibSecond}/GiB·s) ×{" "}
		{rates.regionMultiplier} region multiplier ={" "}
		{usd(workerUsdPerSecond(rates) * 3600)}
		/worker·h
	</span>
);

/** Run cost; muted with a pulsing dot while it is still accruing. */
export const CostValue = ({
	cost,
	rates,
	className,
}: {
	cost: RunCost;
	rates?: CostRates;
	className?: string;
}) => (
	<Tooltip
		content={
			<span className="flex flex-col gap-0.5">
				<span className="tabular-nums">
					{num(Math.round(cost.workerSeconds))} worker-seconds (
					{formatMs(cost.workerSeconds * 1000)})
					{cost.final ? "" : " · accruing"}
				</span>
				{rates && <RatesLine rates={rates} />}
			</span>
		}
	>
		<span
			className={cn(
				"inline-flex items-center gap-1.5 tabular-nums",
				cost.final ? "text-foreground" : "text-tertiary-foreground",
				className,
			)}
		>
			{!cost.final && <StatusDot tone="info" pulse />}
			{usd(cost.usd)}
		</span>
	</Tooltip>
);
