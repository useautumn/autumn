import {
	ATOM_METRICS_RANGES,
	ATOM_METRICS_STATISTICS,
	type AtomMetricsRange,
	type AtomMetricsStatistic,
	type ByocCacheMachine,
} from "@autumn/shared";
import { GroupedTabButton } from "@autumn/ui";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useAtomMetricsQuery } from "@/hooks/queries/useAtomMetricsQuery";
import { SettingsGroup } from "@/views/settings/components/SettingsGroup";
import { AtomRequestsChart } from "./AtomRequestsChart";
import { AtomUtilizationChart } from "./AtomUtilizationChart";
import { toAtomMetricsChartData } from "./atomMetricsChartData";
import { STATISTIC_LABELS } from "./atomMetricsFormat";

const RANGE_OPTIONS = ATOM_METRICS_RANGES.map((range) => ({
	value: range,
	label: range,
}));

const STATISTIC_OPTIONS = ATOM_METRICS_STATISTICS.map((statistic) => ({
	value: statistic,
	label: STATISTIC_LABELS[statistic].name,
}));

/** How hard Atom's machine works and how much traffic it answers, over a chosen range and statistic. */
export const AtomMonitoring = ({
	machine,
}: {
	machine: ByocCacheMachine | null;
}) => {
	const [range, setRange] = useQueryState(
		"atomRange",
		parseAsStringEnum<AtomMetricsRange>([...ATOM_METRICS_RANGES]).withDefault(
			"24h",
		),
	);
	const [statistic, setStatistic] = useQueryState(
		"atomStatistic",
		parseAsStringEnum<AtomMetricsStatistic>([
			...ATOM_METRICS_STATISTICS,
		]).withDefault("maximum"),
	);
	const { points, latest, periodSeconds, fetchedAt, isLoading } =
		useAtomMetricsQuery({ range });
	const chartData = toAtomMetricsChartData({
		points,
		latest,
		periodSeconds,
		range,
		statistic,
		fetchedAt,
	});

	return (
		<SettingsGroup
			title="Monitoring"
			trailing={
				<div className="flex items-center gap-2">
					<GroupedTabButton
						value={statistic}
						onValueChange={(value) =>
							setStatistic(value as AtomMetricsStatistic)
						}
						options={STATISTIC_OPTIONS}
					/>
					<GroupedTabButton
						value={range}
						onValueChange={(value) => setRange(value as AtomMetricsRange)}
						options={RANGE_OPTIONS}
					/>
				</div>
			}
		>
			<AtomUtilizationChart
				machine={machine}
				chartData={chartData}
				isLoading={isLoading}
			/>
			<AtomRequestsChart chartData={chartData} isLoading={isLoading} />
		</SettingsGroup>
	);
};
