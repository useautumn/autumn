import type {
	FullCusEntWithFullCusProduct,
	FullCusProduct,
} from "@autumn/shared";
import { Table } from "@/components/general/table";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { CustomerBalanceTableColumns } from "./CustomerBalanceTableColumns";

export function CustomerBalanceTable({
	allEnts,
	filteredCustomerProducts,
	entityId,
	aggregatedMap,
	isLoading,
}: {
	allEnts: FullCusEntWithFullCusProduct[];
	filteredCustomerProducts: FullCusProduct[];
	entityId: string | null;
	aggregatedMap: Map<string, FullCusEntWithFullCusProduct[]>;
	isLoading: boolean;
}) {
	const setSheet = useCustomerBalanceSheetStore((s) => s.setSheet);

	const columns = CustomerBalanceTableColumns({
		filteredCustomerProducts,
		entityId,
		aggregatedMap,
	});

	const enableSorting = false;
	const table = useCustomerTable<FullCusEntWithFullCusProduct>({
		data: allEnts,
		columns,
		options: {},
	});

	const handleRowClick = (ent: FullCusEntWithFullCusProduct) => {
		const featureId = ent.entitlement.feature.id;
		const ents = aggregatedMap.get(featureId) || [ent];
		setSheet({
			type: "edit-balance",
			featureId,
			originalEntitlements: ents,
		});
	};

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columns.length,
				enableSorting,
				isLoading,
				onRowClick: handleRowClick,
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
