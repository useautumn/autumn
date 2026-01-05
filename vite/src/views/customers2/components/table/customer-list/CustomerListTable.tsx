import type { FullCustomer } from "@autumn/shared";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Table } from "@/components/general/table";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { pushPage } from "@/utils/genUtils";
import { useCustomersQueryStates } from "@/views/customers/hooks/useCustomersQueryStates";
import { useCustomerListColumns } from "@/views/customers2/hooks/useCustomerListColumns";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import type { CustomerWithProducts } from "./CustomerListColumns";
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
	const { features } = useFeaturesQuery();

	// Subscribe to full_customers query to get reactive updates
	const {
		data: fullCustomersData,
		isLoading: isFullCustomersLoading,
		isFetching: isFullCustomersFetching,
	} = useQuery<{ fullCustomers: FullCustomer[] }>({
		queryKey: ["full_customers"],
		// Placeholder queryFn - actual fetching is done by useFullCusSearchQuery
		queryFn: () => Promise.resolve({ fullCustomers: [] }),
		// Don't fetch - just subscribe to existing data from useFullCusSearchQuery
		enabled: false,
	});

	// Build map from full customers data for quick lookup
	const fullCustomersMap = useMemo(() => {
		const map = new Map<string, FullCustomer>();
		if (fullCustomersData?.fullCustomers) {
			for (const fullCustomer of fullCustomersData.fullCustomers) {
				const key = fullCustomer.id || fullCustomer.internal_id;
				map.set(key, fullCustomer);
			}
		}
		return map;
	}, [fullCustomersData]);

	// Determine if full data is still loading (includes refetches for search/pagination)
	const isFullDataLoading =
		isFullCustomersLoading ||
		isFullCustomersFetching ||
		fullCustomersMap.size === 0;

	// Merge basic customer data with full customer data (for balance info)
	const mergedCustomers = useMemo(() => {
		return customers.map((customer) => {
			const key = customer.id || customer.internal_id;
			const fullCustomer = fullCustomersMap.get(key);

			return {
				...customer,
				fullCustomerProducts: fullCustomer?.customer_products,
				isFullDataLoading: !fullCustomer && isFullDataLoading,
			} as CustomerWithProducts;
		});
	}, [customers, fullCustomersMap, isFullDataLoading]);

	// Create columns including dynamic usage columns from metered features
	const { columns, defaultVisibleColumnIds, columnGroups } =
		useCustomerListColumns({ features });

	// Column visibility management
	const { columnVisibility, setColumnVisibility } = useColumnVisibility({
		columns,
		defaultVisibleColumnIds,
		storageKey: "customer-list",
		columnGroups,
	});

	const table = useCustomerTable({
		data: mergedCustomers,
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
			state: { columnVisibility },
			onColumnVisibilityChange: setColumnVisibility,
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
				actionButton={
					<div className="flex items-center gap-2">
						<IconButton
							variant="secondary"
							iconOrientation="right"
							icon={<ArrowSquareOutIcon size={16} />}
							onClick={() => {
								window.open(
									"https://docs.useautumn.com/documentation/getting-started/setup/sdk",
									"_blank",
								);
							}}
						>
							Docs
						</IconButton>
						<CustomerListCreateButton />
					</div>
				}
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
						enableColumnVisibility: true,
						columnVisibilityStorageKey: "customer-list",
						columnGroups,
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
