import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import { type ExpandedState, getExpandedRowModel } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { CustomerBalanceTableColumns } from "./CustomerBalanceTableColumns";

export type CustomerBalanceRowData = FullCusEntWithFullCusProduct & {
	subRows?: FullCusEntWithFullCusProduct[];
};

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
	const balanceOpen = sheetType === "balance-edit";
	const selectedCusEntId = useCustomerBalanceSheetStore(
		(s) => s.selectedCusEntId,
	);
	const selectedFeatureId = useCustomerBalanceSheetStore((s) => s.featureId);

	const [expanded, setExpanded] = useState<ExpandedState>({});

	const rowData: CustomerBalanceRowData[] = useMemo(() => {
		return allEnts.map((ent) => {
			const featureId = ent.entitlement.feature.id;
			const originalEnts = aggregatedMap.get(featureId);
			if (originalEnts && originalEnts.length > 1) {
				return { ...ent, subRows: originalEnts };
			}
			return ent;
		});
	}, [allEnts, aggregatedMap]);

	const columns = useMemo(
		() =>
			CustomerBalanceTableColumns({
				fullCustomer: customer,
				entityId,
				entities: customer?.entities || [],
			}),
		[customer, entityId],
	);

	const table = useCustomerTable<CustomerBalanceRowData>({
		data: rowData,
		columns,
		options: {
			getExpandedRowModel: getExpandedRowModel(),
			getSubRows: (row) => row.subRows,
			getRowCanExpand: (row) => (row.original.subRows?.length ?? 0) > 0,
			state: { expanded },
			onExpandedChange: setExpanded,
		},
	});

	const handleRowClick = (ent: CustomerBalanceRowData) => {
		const hasSubRows = (ent.subRows?.length ?? 0) > 0;

		if (hasSubRows) {
			const rowId = ent.id || "";
			setExpanded((prev) => {
				const current = typeof prev === "boolean" ? {} : { ...prev };
				current[rowId] = !current[rowId];
				return current;
			});
			return;
		}

		// Single balance or sub-row: open edit sheet directly
		const featureId = ent.entitlement.feature.id;
		const ents = aggregatedMap.get(featureId) || [ent];

		setBalanceSheet({
			type: "edit-balance",
			featureId,
			originalEntitlements: ents,
			selectedCusEntId: ent.id,
		});
		setSheet({ type: "balance-edit" });
	};

	const getSelectedRowId = () => {
		if (!balanceOpen) return undefined;
		if (selectedCusEntId) return selectedCusEntId;
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
				enableSorting: false,
				isLoading,
				onRowClick: handleRowClick,
				flexibleTableColumns: true,
				selectedItemId: getSelectedRowId(),
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
