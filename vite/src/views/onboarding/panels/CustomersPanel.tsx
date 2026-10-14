import type { FullCustomer } from "@autumn/shared";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { pushPage } from "@/utils/genUtils";
import {
	type CustomerWithProducts,
	createCustomerListColumns,
} from "@/views/customers2/components/table/customer-list/CustomerListColumns";
import { PanelSection } from "./PanelSection";

const PANEL_HEIGHT = "148px";
const ROW_HEIGHT = 36;

export function CustomersPanel({
	customers,
	isLoading,
}: {
	customers: FullCustomer[];
	isLoading?: boolean;
}) {
	const columns = useMemo(
		() =>
			createCustomerListColumns().filter(
				(column) => column.id !== "actions" && column.id !== "email",
			),
		[],
	);

	const data = customers as unknown as CustomerWithProducts[];

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		enableSorting: false,
		getRowId: (row) => row.internal_id ?? row.id ?? "",
	});

	if (customers.length === 0) {
		return (
			<PanelSection
				isLoading={isLoading}
				isEmpty={!isLoading}
				loadingText="Loading customers"
				emptyText="Your customers will show up here"
			/>
		);
	}

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columns.length,
				isLoading: Boolean(isLoading),
				enableSorting: false,
				flexibleTableColumns: true,
				rowClassName: "h-9",
				emptyStateText: "Your customers will show up here",
				getRowHref: (customer: CustomerWithProducts) =>
					pushPage({
						path: `/customers/${customer.id ?? customer.internal_id}`,
					}),
				virtualization: {
					containerHeight: PANEL_HEIGHT,
					rowHeight: ROW_HEIGHT,
				},
			}}
		>
			<Table.Container>
				<Table.VirtualizedContent>
					<Table.VirtualizedBody />
				</Table.VirtualizedContent>
			</Table.Container>
		</Table.Provider>
	);
}
