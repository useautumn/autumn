import { AppEnv, type FullCustomer } from "@autumn/shared";
import { IconButton } from "@autumn/ui";
import { ArrowSquareOutIcon, UsersIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { getLastSwitchedOrgId, useOrg } from "@/hooks/common/useOrg";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useColumnVisibility } from "@autumn/ui";
import { useEnv } from "@/utils/envUtils";
import { pushPage } from "@/utils/genUtils";
import { useCustomerFilters } from "@/views/customers/hooks/useCustomerFilters";
import { FULL_CUSTOMERS_QUERY_KEY } from "@/views/customers/hooks/useFullCusSearchQuery";
import { useCustomerListColumns } from "@/views/customers2/hooks/useCustomerListColumns";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import type { CustomerWithProducts } from "./CustomerListColumns";
import { CustomerListCreateButton } from "./CustomerListCreateButton";
import { CustomerListFilterButton } from "./CustomerListFilterButton";
import {
	CustomerListPageSizeSelector,
	CustomerListPagination,
} from "./CustomerListPagination";
import { CustomerListSearchBar } from "./CustomerListSearchBar";

export function CustomerListTable({
	customers,
	isFetchingUncached,
}: {
	customers: CustomerWithProducts[];
	isFetchingUncached: boolean;
}) {
	const { org } = useOrg();
	const env = useEnv();

	const tableContainerHeight =
		env === AppEnv.Sandbox ? "calc(100vh - 230px)" : "calc(100vh - 190px)";

	const { features } = useFeaturesQuery();
	const { queryStates, currentCursor } = useCustomerFilters();
	const buildKey = useQueryKeyFactory();

	const {
		data: fullCustomersData,
		isLoading: isFullCustomersLoading,
		isFetching: isFullCustomersFetching,
	} = useQuery<{ fullCustomers: FullCustomer[]; next_cursor: string | null }>({
		queryKey: buildKey([
			FULL_CUSTOMERS_QUERY_KEY,
			currentCursor,
			queryStates.pageSize,
			queryStates.status,
			queryStates.version,
			queryStates.none,
			queryStates.processor,
			queryStates.q,
		]),
		queryFn: () => Promise.resolve({ fullCustomers: [], next_cursor: null }),
		enabled: false,
	});

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

	const isFullDataLoading =
		isFullCustomersLoading ||
		isFullCustomersFetching ||
		fullCustomersMap.size === 0;

	const mergedCustomers = useMemo(() => {
		return customers.map((customer) => {
			const key = customer.id || customer.internal_id;
			const fullCustomer = fullCustomersMap.get(key);

			return {
				...customer,
				...(fullCustomer
					? {
							customer_products: fullCustomer.customer_products,
							products_total_count: fullCustomer.products_total_count,
						}
					: {}),
				fullCustomer,
				isFullDataLoading: !fullCustomer && isFullDataLoading,
			} as CustomerWithProducts;
		});
	}, [customers, fullCustomersMap, isFullDataLoading]);

	const orgId = org?.id ?? getLastSwitchedOrgId();
	const columnStorageKey = orgId ? `customer-list:${orgId}` : "customer-list";

	const { columns, defaultVisibleColumnIds, columnGroups } =
		useCustomerListColumns({
			features,
			storageKey: columnStorageKey,
		});

	const {
		columnVisibility,
		setColumnVisibility,
		isDirty: columnVisibilityIsDirty,
		saveColumnVisibility,
	} = useColumnVisibility({
		columns,
		defaultVisibleColumnIds,
		storageKey: columnStorageKey,
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

	const getRowHref = (customer: CustomerWithProducts) =>
		pushPage({
			path: `/customers/${customer.id || customer.internal_id}`,
			preserveParams: false,
		});

	const hasRows = table.getRowModel().rows.length > 0;
	const hasSearchQuery = Boolean(queryStates.q?.trim());
	const hasFilters =
		queryStates.status.length > 0 ||
		queryStates.version.length > 0 ||
		queryStates.none ||
		queryStates.processor.length > 0;
	const hasActiveFiltersOrSearch = hasSearchQuery || hasFilters;

	if (!hasRows && !hasActiveFiltersOrSearch && !isFetchingUncached) {
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
									"https://docs.useautumn.com/documentation/getting-started/setup",
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
		<Table.Provider
			config={{
				table,
				numberOfColumns: columns.length,
				enableSorting: false,
				isLoading: isFetchingUncached && customers.length === 0,
				isTransitioning: isFetchingUncached && customers.length > 0,
				getRowHref,
				emptyStateText: "No matching results found.",
				rowClassName: "h-10",
				enableColumnVisibility: true,
				columnVisibilityStorageKey: columnStorageKey,
				columnGroups,
				columnVisibilityIsDirty,
				onColumnVisibilitySave: saveColumnVisibility,
				columnVisibilityInToolbar: true,
				flexibleTableColumns: true,
				virtualization: {
					containerHeight: tableContainerHeight,
				},
			}}
		>
			<div>
				<Table.Toolbar>
					<Table.Heading>
						<UsersIcon size={16} weight="fill" className="text-subtle" />
						Customers
					</Table.Heading>
					<Table.Actions>
						<CustomerListCreateButton />
					</Table.Actions>
				</Table.Toolbar>
				<div className="flex flex-wrap items-center gap-2 pb-4">
					<div className="order-2 md:order-1">
						<CustomerListFilterButton />
					</div>
					<div className="order-3 md:order-2">
						<Table.ColumnVisibility />
					</div>
					<div className="order-1 w-full md:order-3 md:w-auto md:flex-1 md:min-w-0">
						<CustomerListSearchBar />
					</div>
					<div className="order-4 ml-auto flex items-center gap-2 shrink-0">
						<CustomerListPagination />
						<CustomerListPageSizeSelector />
					</div>
				</div>
				{!hasRows && hasActiveFiltersOrSearch && !isFetchingUncached ? (
					<EmptyState
						type="no-customers-found"
						actionButton={<CustomerListCreateButton />}
					/>
				) : (
					<Table.Container>
						<Table.VirtualizedContent>
							<Table.VirtualizedBody />
						</Table.VirtualizedContent>
					</Table.Container>
				)}
			</div>
		</Table.Provider>
	);
}
