import type { FullCusEntWithOptionalProduct } from "@autumn/shared";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { CustomerBooleanBalanceTableColumns } from "./CustomerBooleanBalanceTableColumns";

export function CustomerBooleanBalanceTable({
	allEnts,
	aggregatedMap,
	isLoading,
}: {
	allEnts: FullCusEntWithOptionalProduct[];
	aggregatedMap: Map<string, FullCusEntWithOptionalProduct[]>;
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
	const table = useCustomerTable<FullCusEntWithOptionalProduct>({
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
				rowClassName: "pointer-events-none",
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
