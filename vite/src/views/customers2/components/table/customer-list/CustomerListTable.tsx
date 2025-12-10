import type { FullCustomer } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Table } from "@/components/general/table";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { pushPage } from "@/utils/genUtils";
import { useCustomersQueryStates } from "@/views/customers/hooks/useCustomersQueryStates";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import {
	BASE_COLUMN_IDS,
	type CustomerWithProducts,
	createCustomerListColumns,
	createUsageColumn,
} from "./CustomerListColumns";
import { CustomerListCreateButton } from "./CustomerListCreateButton";
import { CustomerListFilterButton } from "./CustomerListFilterButton";
import { CustomerListPagination } from "./CustomerListPagination";
import { CustomerListSearchBar } from "./CustomerListSearchBar";
import { UsageFeatureSubmenu } from "./UsageFeatureSubmenu";

const USAGE_FEATURES_STORAGE_KEY = "autumn:customer-list-usage-features";

function loadUsageFeatures(): string[] {
	try {
		const saved = localStorage.getItem(USAGE_FEATURES_STORAGE_KEY);
		if (saved) {
			const parsed = JSON.parse(saved) as string[];
			// Filter out any invalid entries (empty strings, etc.)
			return parsed.filter((id) => id && typeof id === "string" && id.trim());
		}
	} catch {
		// Ignore errors
	}
	return [];
}

function saveUsageFeatures(featureIds: string[]): void {
	try {
		localStorage.setItem(
			USAGE_FEATURES_STORAGE_KEY,
			JSON.stringify(featureIds),
		);
	} catch {
		// Ignore errors
	}
}

export function CustomerListTable({
	customers,
}: {
	customers: CustomerWithProducts[];
}) {
	const navigate = useNavigate();
	const { features, isLoading: isFeaturesLoading } = useFeaturesQuery();

	// Subscribe to full_customers query to get reactive updates
	const { data: fullCustomersData, isLoading: isFullCustomersLoading } =
		useQuery<{ fullCustomers: FullCustomer[] }>({
			queryKey: ["full_customers"],
			// Don't fetch - just subscribe to existing data from useFullCusSearchQuery
			enabled: false,
		});

	// Track selected usage features for dynamic columns
	const [rawSelectedUsageFeatureIds, setSelectedUsageFeatureIds] =
		useState<string[]>(loadUsageFeatures);

	// Track what's saved in localStorage (for comparison)
	const [savedUsageFeatureIds, setSavedUsageFeatureIds] =
		useState<string[]>(loadUsageFeatures);

	// Check if we have saved usage features (to determine if we should wait for features to load)
	const hasSavedUsageFeatures = rawSelectedUsageFeatureIds.length > 0;

	// Filter out stale feature IDs that don't exist in current org's features
	const selectedUsageFeatureIds = useMemo(() => {
		if (!features || features.length === 0) return rawSelectedUsageFeatureIds;
		const validFeatureIds = new Set(features.map((f) => f.id));
		return rawSelectedUsageFeatureIds.filter((id) => validFeatureIds.has(id));
	}, [rawSelectedUsageFeatureIds, features]);

	// Check if usage features have unsaved changes
	const hasUnsavedUsageChanges = useMemo(() => {
		const currentSet = new Set(selectedUsageFeatureIds);
		const savedSet = new Set(savedUsageFeatureIds);
		if (currentSet.size !== savedSet.size) return true;
		for (const id of currentSet) {
			if (!savedSet.has(id)) return true;
		}
		return false;
	}, [selectedUsageFeatureIds, savedUsageFeatureIds]);

	// Save usage features to localStorage
	const handleSaveUsageFeatures = useCallback(() => {
		saveUsageFeatures(selectedUsageFeatureIds);
		setSavedUsageFeatureIds([...selectedUsageFeatureIds]);
	}, [selectedUsageFeatureIds]);

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

	// Determine if full data is still loading
	const isFullDataLoading =
		isFullCustomersLoading || fullCustomersMap.size === 0;

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

	// Build columns: base columns + dynamic usage columns
	const columns = useMemo(() => {
		const baseColumns = createCustomerListColumns();

		// Create usage columns for selected features
		const usageColumns = selectedUsageFeatureIds
			.map((featureId) => {
				const feature = features.find((f) => f.id === featureId);
				if (!feature) return null;
				return createUsageColumn({
					featureId: feature.id,
					featureName: feature.name,
				});
			})
			.filter((col): col is NonNullable<typeof col> => col !== null);

		// Insert usage columns before the actions column
		const actionsColumnIndex = baseColumns.findIndex(
			(col) => col.id === "actions",
		);
		if (actionsColumnIndex !== -1 && usageColumns.length > 0) {
			return [
				...baseColumns.slice(0, actionsColumnIndex),
				...usageColumns,
				...baseColumns.slice(actionsColumnIndex),
			];
		}

		return [...baseColumns, ...usageColumns];
	}, [selectedUsageFeatureIds, features]);

	// Column visibility management - load from localStorage synchronously to avoid flash
	const { columnVisibility, setColumnVisibility } = useColumnVisibility({
		columns,
		defaultVisibleColumnIds: BASE_COLUMN_IDS,
		storageKey: "customer-list",
	});

	// Toggle usage feature selection - also updates column visibility
	const handleToggleUsageFeature = useCallback(
		(featureId: string) => {
			const columnId = `usage_${featureId}`;
			const isCurrentlySelected = selectedUsageFeatureIds.includes(featureId);

			if (isCurrentlySelected) {
				// Removing feature - hide column and remove from selection
				setColumnVisibility((prev) => ({ ...prev, [columnId]: false }));
				setSelectedUsageFeatureIds((prev) =>
					prev.filter((id) => id !== featureId),
				);
			} else {
				// Adding feature - add to selection and show column (with deduplication)
				setSelectedUsageFeatureIds((prev) => {
					if (prev.includes(featureId)) return prev;
					return [...prev, featureId];
				});
				// Set visibility to true for the new column
				setColumnVisibility((prev) => ({ ...prev, [columnId]: true }));
			}
		},
		[selectedUsageFeatureIds, setColumnVisibility],
	);

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
						enableColumnVisibility: true,
						columnVisibilityStorageKey: "customer-list",
						columnVisibilityExtras: (
							<UsageFeatureSubmenu
								features={features}
								selectedUsageFeatureIds={selectedUsageFeatureIds}
								onToggleUsageFeature={handleToggleUsageFeature}
							/>
						),
						onColumnVisibilitySave: handleSaveUsageFeatures,
						hasUnsavedExtrasChanges: hasUnsavedUsageChanges,
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
