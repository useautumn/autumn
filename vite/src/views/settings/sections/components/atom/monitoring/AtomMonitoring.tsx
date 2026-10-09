import {
	ATOM_METRICS_RANGES,
	type AtomMetricsRange,
	type ByocCacheMachine,
} from "@autumn/shared";
import { GroupedTabButton } from "@autumn/ui";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useAtomMetricsQuery } from "@/hooks/queries/useAtomMetricsQuery";
import { SettingsGroup } from "@/views/settings/components/SettingsGroup";
import { AtomRequestsChart } from "./AtomRequestsChart";
import { AtomUtilizationChart } from "./AtomUtilizationChart";
import { toAtomMetricsChartData } from "./atomMetricsChartData";

const RANGE_OPTIONS = ATOM_METRICS_RANGES.map((range) => ({
	value: range,
	label: range,
}));

/** How hard Atom's machine works and how much traffic it answers, over a chosen range. */
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
	const { points, bucketSeconds, fetchedAt, isLoading } = useAtomMetricsQuery({
		range,
	});
	const chartData = toAtomMetricsChartData({
		points,
		bucketSeconds,
		range,
		now: fetchedAt,
	});

	return (
		<SettingsGroup
			title="Monitoring"
			description="How hard the machine is working, and how much traffic Atom answers on its own."
			trailing={
				<GroupedTabButton
					value={range}
					onValueChange={(value) => setRange(value as AtomMetricsRange)}
					options={RANGE_OPTIONS}
				/>
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
