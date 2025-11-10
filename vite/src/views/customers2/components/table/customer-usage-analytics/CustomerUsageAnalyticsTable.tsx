import { ChartBar } from "@phosphor-icons/react";
import {
	parseAsArrayOf,
	parseAsInteger,
	parseAsString,
	useQueryState,
} from "nuqs";
import { useEffect, useMemo } from "react";
import { Table } from "@/components/general/table";
import { useCusEventsQuery } from "@/views/customers/customer/hooks/useCusEventsQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { CustomerUsageAnalyticsChart } from "./CustomerUsageAnalyticsChart";
import { CustomerUsageAnalyticsColumns } from "./CustomerUsageAnalyticsColumns";
import { CustomerUsageAnalyticsFullButton } from "./CustomerUsageAnalyticsFullButton";
import { CustomerUsageAnalyticsSelectDays } from "./CustomerUsageAnalyticsSelectDays";
import { CustomerUsageAnalyticsSelectFeatures } from "./CustomerUsageAnalyticsSelectFeatures";
import {
	filterEventsByTimeAndFeatures,
	getAvailableFeatures,
} from "./customerUsageAnalyticsUtils";

export function CustomerUsageAnalyticsTable() {
	const { events, isLoading } = useCusEventsQuery();

	const [selectedDays, setSelectedDays] = useQueryState(
		"analyticsTimeRange",
		parseAsInteger.withDefault(7),
	);

	const [selectedFeatures, setSelectedFeatures] = useQueryState(
		"analyticsFeatures",
		parseAsArrayOf(parseAsString).withDefault([]),
	);

	const availableFeatures = useMemo(
		() => getAvailableFeatures({ events: events ?? [] }),
		[events],
	);

	useEffect(() => {
		if (
			availableFeatures.length > 0 &&
			selectedFeatures &&
			selectedFeatures.length === 0
		) {
			setSelectedFeatures(availableFeatures as string[]);
		}
	}, [availableFeatures, selectedFeatures, setSelectedFeatures]);

	const filteredEvents = useMemo(
		() =>
			filterEventsByTimeAndFeatures({
				events: events ?? [],
				selectedDays,
				selectedFeatures,
			}),
		[events, selectedDays, selectedFeatures],
	);

	const enableSorting = false;
	const table = useCustomerTable({
		data: filteredEvents,
		columns: CustomerUsageAnalyticsColumns,
	});

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: CustomerUsageAnalyticsColumns.length,
				enableSorting,
				isLoading,
			}}
		>
			<Table.Container>
				<Table.Toolbar>
					<Table.Heading>
						<ChartBar size={16} weight="fill" className="text-t5" />
						Usage Analytics
					</Table.Heading>
					<Table.Actions>
						<CustomerUsageAnalyticsSelectFeatures
							availableFeatures={availableFeatures as string[]}
							selectedFeatures={selectedFeatures}
							setSelectedFeatures={setSelectedFeatures}
						/>
						<CustomerUsageAnalyticsSelectDays
							selectedDays={selectedDays}
							setSelectedDays={setSelectedDays}
						/>
						<CustomerUsageAnalyticsFullButton />
					</Table.Actions>
				</Table.Toolbar>
				<CustomerUsageAnalyticsChart
					events={filteredEvents}
					daysToShow={selectedDays ?? 7}
				/>
				<Table.Content>
					<Table.Header />
					<Table.Body />
				</Table.Content>
			</Table.Container>
		</Table.Provider>
	);
}
