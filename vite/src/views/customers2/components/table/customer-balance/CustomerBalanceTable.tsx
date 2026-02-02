import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import { Table } from "@/components/general/table";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { CustomerBalanceTableColumns } from "./CustomerBalanceTableColumns";

export function CustomerBalanceTable({
	allEnts,
	entityId,
	aggregatedMap,
	isLoading,
}: {
	allEnts: FullCusEntWithFullCusProduct[];
	entityId: string | null;
	aggregatedMap: Map<string, FullCusEntWithFullCusProduct[]>;
	isLoading: boolean;
}) {
	const { customer } = useCusQuery();
	const setBalanceSheet = useCustomerBalanceSheetStore((s) => s.setSheet);
	const setSheet = useSheetStore((s) => s.setSheet);
	const sheetType = useSheetStore((s) => s.type);
	const balanceOpen =
		sheetType === "balance-selection" || sheetType === "balance-edit";
	const selectedCusEntId = useCustomerBalanceSheetStore(
		(s) => s.selectedCusEntId,
	);
	const selectedFeatureId = useCustomerBalanceSheetStore((s) => s.featureId);

	const columns = CustomerBalanceTableColumns({
		fullCustomer: customer,
		entityId,
		aggregatedMap,
		entities: customer?.entities || [],
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
		const hasMultipleBalances = ents.length > 1;

		// Set balance data in balance store
		setBalanceSheet({
			type: "edit-balance",
			featureId,
			originalEntitlements: ents,
			selectedCusEntId: hasMultipleBalances ? null : ents[0].id,
		});

		// Open the appropriate inline sheet
		if (hasMultipleBalances) {
			setSheet({ type: "balance-selection" });
		} else {
			setSheet({ type: "balance-edit" });
		}
	};

	// Determine the selected row ID based on whether it's an aggregated balance or single balance
	const getSelectedRowId = () => {
		if (!balanceOpen) return undefined;
		// For single balance selection, match by customer entitlement ID
		if (selectedCusEntId) return selectedCusEntId;
		// For aggregated balance selection, find the row that matches the feature ID
		if (selectedFeatureId) {
			const matchingEnt = allEnts.find(
				(ent) => ent.entitlement.feature.id === selectedFeatureId,
			);
			return matchingEnt?.id;
		}
		return undefined;
	};

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columns.length,
				enableSorting,
				isLoading,
				onRowClick: handleRowClick,
				flexibleTableColumns: true,
				selectedItemId: getSelectedRowId(), //decides the highlighted row on sheetopen
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
