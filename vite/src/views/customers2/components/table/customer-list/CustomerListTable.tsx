import { AppEnv, type FullCustomer } from "@autumn/shared";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { useOrg } from "@/hooks/common/useOrg";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { useEnv } from "@/utils/envUtils";
import { getVersionCounts } from "@/utils/productUtils";
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

	// Account for sandbox banner height (40px) in table container height
	const tableContainerHeight =
		env === AppEnv.Sandbox ? "calc(100vh - 174px)" : "calc(100vh - 134px)";

	const { features } = useFeaturesQuery();
	const { products } = useProductsQuery();
	const showProductVersions = useMemo(() => {
		const versionCounts = getVersionCounts(products);
		return Object.values(versionCounts).some(
			(v) => typeof v === "number" && v > 1,
		);
	}, [products]);
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
		queryFn: () =>
			Promise.resolve({ fullCustomers: [], next_cursor: null }),
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
				fullCustomer,
				isFullDataLoading: !fullCustomer && isFullDataLoading,
			} as CustomerWithProducts;
		});
	}, [customers, fullCustomersMap, isFullDataLoading]);

	const columnStorageKey = org?.id
		? `customer-list:${org.id}`
		: "customer-list";

	// Create columns including dynamic usage columns from metered features
	const { columns, defaultVisibleColumnIds, columnGroups } =
		useCustomerListColumns({
			features,
			storageKey: columnStorageKey,
			showProductVersions,
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

	const enableSorting = false;

	const hasRows = table.getRowModel().rows.length > 0;
	const hasSearchQuery = Boolean(queryStates.q?.trim());
	const hasFilters =
		queryStates.status.length > 0 ||
		queryStates.version.length > 0 ||
		queryStates.none ||
		queryStates.processor.length > 0;
	const hasActiveFiltersOrSearch = hasSearchQuery || hasFilters;

	// Only show empty state if org has NO customers (no filters/search active and no results)
	if (!hasRows && !hasActiveFiltersOrSearch) {
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
				enableSorting,
				isLoading: isFetchingUncached,
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
				<div className="flex flex-col lg:flex-row w-full lg:items-center gap-2 lg:gap-5 pb-4">
					<div className="flex items-center gap-2 lg:flex-1">
						<CustomerListSearchBar />
						<CustomerListFilterButton />
						<Table.ColumnVisibility />
					</div>
					<div className="flex items-center justify-between lg:contents">
						<div className="flex items-center gap-2 lg:justify-center">
							<CustomerListPagination />
							<CustomerListPageSizeSelector />
						</div>
						<div className="flex items-center lg:flex-1 justify-end">
							<CustomerListCreateButton />
						</div>
					</div>
				</div>
				{!hasRows && hasActiveFiltersOrSearch ? (
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
