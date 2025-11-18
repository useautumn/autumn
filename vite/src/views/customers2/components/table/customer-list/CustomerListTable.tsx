import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Table } from "@/components/general/table";
import { pushPage } from "@/utils/genUtils";
import { useCustomersQueryStates } from "@/views/customers/hooks/useCustomersQueryStates";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import {
	type CustomerWithProducts,
	createCustomerListColumns,
} from "./CustomerListColumns";
import { CustomerListCreateButton } from "./CustomerListCreateButton";
import { CustomerListFilterButton } from "./CustomerListFilterButton";
import { CustomerListPagination } from "./CustomerListPagination";
import { CustomerListSearchBar } from "./CustomerListSearchBar";

export function CustomerListTable({
	customers,
}: {
	customers: CustomerWithProducts[];
}) {
	const navigate = useNavigate();

	const columns = useMemo(() => createCustomerListColumns(), []);

	const table = useCustomerTable({
		data: customers,
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
		},
	});

	const handleRowClick = (customer: CustomerWithProducts) => {
		navigate(
			pushPage({
				path: `/customers/${customer.id || customer.internal_id}`,
			}),
		);
	};

	const enableSorting = false;

	const { queryStates } = useCustomersQueryStates();

	const emptyStateText = queryStates.q?.trim()
		? "No matching results found. Try a different search."
		: "Create your first customer by using the Autumn API";

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columns.length,
				enableSorting,
				isLoading: false,
				onRowClick: handleRowClick,
				emptyStateText,
				rowClassName: "h-10",
			}}
		>
			<div className="flex w-full justify-between items-center h-10 pb-4">
				<div className="flex items-center gap-2">
					<CustomerListFilterButton />
					<CustomerListSearchBar />
					<CustomerListPagination />
					{/* <div className="text-t2 px-2 py-0.5 rounded-md bg-muted text-sm font-medium">
						{totalCount}
					</div> */}
				</div>
				<CustomerListCreateButton />
			</div>
			<div>
				<Table.Container>
					<Table.Content>
						<Table.Header />
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</div>
		</Table.Provider>
	);
}
