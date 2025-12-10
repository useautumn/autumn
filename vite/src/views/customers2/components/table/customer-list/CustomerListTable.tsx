import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Table } from "@/components/general/table";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
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

	// Close any open sheet on mount in useEffect

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
				preserveParams: false,
			}),
		);
	};

	const enableSorting = false;

	const { queryStates } = useCustomersQueryStates();

	const hasRows = table.getRowModel().rows.length > 0;
	const hasSearchQuery = Boolean(queryStates.q?.trim());

	if (!hasRows && !hasSearchQuery) {
		return (
			<EmptyState
				type="customers"
				actionButton={<CustomerListCreateButton />}
			/>
		);
	}

	return (
		<>
			<div className="flex w-full justify-between items-center h-10 pb-4">
				<div className="flex items-center gap-2">
					<CustomerListFilterButton />
					<CustomerListSearchBar />
					<CustomerListPagination />
				</div>
				<CustomerListCreateButton />
			</div>

			{!hasRows && hasSearchQuery ? (
				<EmptyState
					type="no-customers-found"
					actionButton={<CustomerListCreateButton />}
				/>
			) : (
				<Table.Provider
					config={{
						table,
						numberOfColumns: columns.length,
						enableSorting,
						isLoading: false,
						onRowClick: handleRowClick,
						emptyStateText: "No matching results found.",
						rowClassName: "h-10",
					}}
				>
					<Table.Container>
						<Table.Content>
							<Table.Header />
							<Table.Body />
						</Table.Content>
					</Table.Container>
				</Table.Provider>
			)}
		</>
	);
}
