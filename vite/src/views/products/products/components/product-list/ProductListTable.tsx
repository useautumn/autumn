import type { ProductV2 } from "@autumn/shared";
import { CubeIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Table } from "@/components/general/table";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { pushPage } from "@/utils/genUtils";
import { useProductsQueryState } from "@/views/products/hooks/useProductsQueryState";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { createProductListColumns } from "./ProductListColumns";
import { ProductListCreateButton } from "./ProductListCreateButton";
import { ProductListMenuButton } from "./ProductListMenuButton";

type ProductWithCounts = ProductV2 & {
	active_count?: number;
};

export function ProductListTable() {
	const navigate = useNavigate();
	const { products, counts } = useProductsQuery();
	const { queryStates } = useProductsQueryState();

	// Filter products based on archived state and add counts
	const { basePlans, addOnPlans } = useMemo(() => {
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

		// Split into base plans and add-on plans
		const basePlans = productsWithCounts?.filter(
			(product) => !product.is_add_on,
		);
		const addOnPlans = productsWithCounts?.filter(
			(product) => product.is_add_on,
		);

		return { basePlans, addOnPlans };
	}, [products, counts, queryStates.showArchivedProducts]);

	// Check if any product has a group
	const hasAnyGroup = useMemo(
		() =>
			basePlans?.some((product) => Boolean(product.group?.trim())) ||
			addOnPlans?.some((product) => Boolean(product.group?.trim())),
		[basePlans, addOnPlans],
	);

	const columns = useMemo(
		() => createProductListColumns({ showGroup: hasAnyGroup }),
		[hasAnyGroup],
	);

	const baseTable = useProductTable({
		data: basePlans || [],
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
		},
	});

	const addOnTable = useProductTable({
		data: addOnPlans || [],
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
		},
	});

	const handleRowClick = (product: ProductWithCounts) => {
		navigate(
			pushPage({
				path: `/products/${product.id}`,
			}),
		);
	};

	const enableSorting = false;

	const hasBaseRows = baseTable.getRowModel().rows.length > 0;
	const hasAddOns = addOnPlans && addOnPlans.length > 0;
	const isArchivedMode = queryStates.showArchivedProducts;

	// Show table when there are rows OR when in archived mode (so user can toggle back)
	const showTable = hasBaseRows || isArchivedMode;

	return (
		<div className="flex flex-col gap-8">
			{/* Base Plans Table */}
			{showTable ? (
				<div>
					<Table.Provider
						config={{
							table: baseTable,
							numberOfColumns: columns.length,
							enableSorting,
							isLoading: false,
							onRowClick: handleRowClick,
							emptyStateText: "You haven't archived any plans yet.",
							rowClassName: "h-10",
						}}
					>
						<Table.Toolbar>
							<div className="flex w-full justify-between items-center">
								<Table.Heading>
									<CubeIcon size={16} weight="fill" className="text-subtle" />
									{isArchivedMode ? "Archived Plans" : "Base Plans"}
								</Table.Heading>
								<Table.Actions>
									<div className="flex w-full justify-between items-center">
										<div className="flex items-center gap-2">
											{!isArchivedMode && <ProductListCreateButton />}
											<ProductListMenuButton />
										</div>
									</div>
								</Table.Actions>
							</div>
						</Table.Toolbar>
						<div>
							<Table.Container>
								<Table.Content>
									<Table.Header />
									<Table.Body />
								</Table.Content>
							</Table.Container>
						</div>
					</Table.Provider>
				</div>
			) : (
				<EmptyState type="plans" actionButton={<ProductListCreateButton />} />
			)}
			{/* Add-on Plans Table */}
			{hasAddOns && (
				<div>
					<Table.Provider
						config={{
							table: addOnTable,
							numberOfColumns: columns.length,
							enableSorting,
							isLoading: false,
							onRowClick: handleRowClick,
							rowClassName: "h-10",
						}}
					>
						<Table.Toolbar>
							<Table.Heading>
								<CubeIcon size={16} weight="fill" className="text-subtle" />
								Add-on Plans
							</Table.Heading>
						</Table.Toolbar>
						<div>
							<Table.Container>
								<Table.Content>
									{/* <Table.Header /> */}
									<Table.Body />
								</Table.Content>
							</Table.Container>
						</div>
					</Table.Provider>
				</div>
			)}
		</div>
	);
}
