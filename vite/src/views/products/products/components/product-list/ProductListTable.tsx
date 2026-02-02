import { isOneOffProductV2, type ProductV2 } from "@autumn/shared";
import type { SortingState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { SectionTag } from "@/components/v2/badges/SectionTag";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { pushPage } from "@/utils/genUtils";
import { useProductsQueryState } from "@/views/products/hooks/useProductsQueryState";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { DeletePlanDialog } from "@/views/products/plan/components/DeletePlanDialog";
import { createProductListColumns } from "./ProductListColumns";
import { ProductListCreateButton } from "./ProductListCreateButton";

type ProductWithCounts = ProductV2 & {
	active_count?: number;
};

export function ProductListTable() {
	const { products, counts, isCountsLoading } = useProductsQuery();
	const { queryStates } = useProductsQueryState();

	// Shared sorting state for all tables
	const [sorting, setSorting] = useState<SortingState>([]);

	// Delete dialog state - lifted here so dialog doesn't unmount when row is removed
	const [deleteDialog, setDeleteDialog] = useState<{
		open: boolean;
		product: ProductV2 | null;
	}>({ open: false, product: null });

	const handleDeleteClick = useCallback((product: ProductV2) => {
		setDeleteDialog({ open: true, product });
	}, []);

	const { recurringBasePlans, recurringAddOnPlans, oneTimePlans } =
		useMemo(() => {
			const filtered = products?.filter((product) =>
				queryStates.showArchivedProducts ? product.archived : !product.archived,
			);

			// Deduplicate by ID, keeping the latest version
			const deduplicated = filtered?.reduce((acc, product) => {
				const existingIndex = acc.findIndex((p) => p.id === product.id);

				if (existingIndex === -1) {
					acc.push(product);
				} else {
					const existing = acc[existingIndex];
					if (queryStates.showArchivedProducts) {
						// If showing archived, always keep the newest version
						if (product.version > existing.version) {
							acc[existingIndex] = product;
						}
					} else {
						// If not showing archived, prefer non-archived versions
						if (product.archived && !existing.archived) {
							// Keep existing non-archived version
						} else if (!product.archived && existing.archived) {
							// Replace archived with non-archived
							acc[existingIndex] = product;
						} else if (product.version > existing.version) {
							// Both have same archived status, keep newer version
							acc[existingIndex] = product;
						}
					}
				}

				return acc;
			}, [] as ProductV2[]);

			// Add counts to products
			const productsWithCounts = deduplicated?.map((product) => ({
				...product,
				active_count: counts[product.id]?.active || 0,
			})) as ProductWithCounts[];

			// Split by one-off vs recurring first
			const oneTimePlans =
				productsWithCounts?.filter((p) =>
					isOneOffProductV2({ items: p.items }),
				) || [];
			const recurringPlans =
				productsWithCounts?.filter(
					(p) => !isOneOffProductV2({ items: p.items }),
				) || [];

			// Then split recurring by add-on status
			const recurringBasePlans = recurringPlans.filter((p) => !p.is_add_on);
			const recurringAddOnPlans = recurringPlans.filter((p) => p.is_add_on);

			return { recurringBasePlans, recurringAddOnPlans, oneTimePlans };
		}, [products, counts, queryStates.showArchivedProducts]);

	// Check if any product has a group
	const hasAnyGroup = useMemo(
		() =>
			recurringBasePlans?.some((product) => Boolean(product.group?.trim())) ||
			recurringAddOnPlans?.some((product) => Boolean(product.group?.trim())) ||
			oneTimePlans?.some((product) => Boolean(product.group?.trim())),
		[recurringBasePlans, recurringAddOnPlans, oneTimePlans],
	);

	const columns = useMemo(
		() =>
			createProductListColumns({
				showGroup: hasAnyGroup,
				onDeleteClick: handleDeleteClick,
			}),
		[hasAnyGroup, handleDeleteClick],
	);

	const recurringBaseTable = useProductTable({
		data: recurringBasePlans || [],
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
			enableSorting: true,
			state: { sorting },
			onSortingChange: setSorting,
		},
	});

	const recurringAddOnTable = useProductTable({
		data: recurringAddOnPlans || [],
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
			enableSorting: true,
			state: { sorting },
			onSortingChange: setSorting,
		},
	});

	const oneTimeTable = useProductTable({
		data: oneTimePlans || [],
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
			enableSorting: true,
			state: { sorting },
			onSortingChange: setSorting,
		},
	});

	const getRowHref = (product: ProductWithCounts) =>
		pushPage({ path: `/products/${product.id}` });

	const enableSorting = true;

	const hasRecurringBasePlans = recurringBasePlans.length > 0;
	const hasRecurringAddOns = recurringAddOnPlans.length > 0;
	const hasOneTimePlans = oneTimePlans.length > 0;

	// For archived view, always show table structure even if empty
	// For non-archived view, show EmptyState when no plans exist
	const showTableStructure =
		queryStates.showArchivedProducts ||
		hasRecurringBasePlans ||
		hasRecurringAddOns ||
		hasOneTimePlans;

	return (
		<div className="flex flex-col gap-8">
			{showTableStructure ? (
				<>
					{/* Plans Section */}
					<div>
						<Table.Provider
							config={{
								table: recurringBaseTable,
								numberOfColumns: columns.length,
								enableSorting,
								isLoading: isCountsLoading,
								getRowHref,
								emptyStateText: queryStates.showArchivedProducts
									? "You haven't archived any plans yet"
									: "Recurring plans that bill customers on a regular schedule",
								rowClassName: "h-10",
							}}
						>
							<Table.Container>
								<SectionTag>Subscriptions</SectionTag>
								<Table.Content>
									<Table.Header />
									<Table.Body />
								</Table.Content>
							</Table.Container>
						</Table.Provider>

						{/* Add-on Plans (only shown when add-ons exist) */}
						{hasRecurringAddOns && (
							<Table.Provider
								config={{
									table: recurringAddOnTable,
									numberOfColumns: columns.length,
									enableSorting,
									isLoading: isCountsLoading,
									getRowHref,
									rowClassName: "h-10",
								}}
							>
								<Table.Container>
									<SectionTag className="mt-4">Add-on subscriptions</SectionTag>
									<Table.Content>
										<Table.Body />
									</Table.Content>
								</Table.Container>
							</Table.Provider>
						)}

						{/* One-time Plans (always shown) */}
						<Table.Provider
							config={{
								table: oneTimeTable,
								numberOfColumns: columns.length,
								enableSorting,
								isLoading: isCountsLoading,
								getRowHref,
								emptyStateText:
									"One-time prices for top-ups or lifetime purchases",
								rowClassName: "h-10",
							}}
						>
							<Table.Container>
								<SectionTag className="mt-4">One-off purchases</SectionTag>
								<Table.Content>
									<Table.Body />
								</Table.Content>
							</Table.Container>
						</Table.Provider>
					</div>
				</>
			) : (
				<EmptyState type="plans" actionButton={<ProductListCreateButton />} />
			)}

			{/* Delete dialog rendered at table level to prevent unmounting when row is removed */}
			{deleteDialog.product && (
				<DeletePlanDialog
					propProduct={deleteDialog.product}
					open={deleteDialog.open}
					setOpen={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
				/>
			)}
		</div>
	);
}
