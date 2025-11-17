import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { CustomerBooleanBalanceTableColumns } from "./CustomerBooleanBalanceTableColumns";

export function CustomerBooleanBalanceTable({
	allEnts,
	aggregatedMap,
	isLoading,
}: {
	allEnts: FullCusEntWithFullCusProduct[];
	aggregatedMap: Map<string, FullCusEntWithFullCusProduct[]>;
	isLoading: boolean;
}) {
	const columns = useMemo(
		() =>
			CustomerBooleanBalanceTableColumns({
				aggregatedMap,
			}),
		[aggregatedMap],
	);

	const enableSorting = false;
	const table = useCustomerTable<FullCusEntWithFullCusProduct>({
		data: allEnts,
		columns,
		options: {},
	});

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columns.length,
				enableSorting,
				isLoading,
				rowClassName: "pointer-events-none h-10",
			}}
		>
			<Table.Container>
				<Table.Content>
					<Table.Body />
				</Table.Content>
			</Table.Container>
		</Table.Provider>
	);
}
