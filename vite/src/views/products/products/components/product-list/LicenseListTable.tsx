import type { ProductCounts, ProductV2 } from "@autumn/shared";
import type { SortingState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { LicenseSectionTag } from "@/components/v2/icons/LicenseSectionTag";
import type { ProductListItem } from "@/hooks/queries/useProductsQuery";
import { pushPage } from "@/utils/genUtils";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { DeletePlanDialog } from "@/views/products/plan/components/DeletePlanDialog";
import { createProductListColumns } from "./ProductListColumns";

type LicenseWithCount = ProductV2 & { active_count?: number };

export function LicenseListTable({
	licenseProducts,
	counts,
	isCountsLoading,
	showArchivedProducts = false,
}: {
	licenseProducts: ProductListItem[];
	counts: Record<string, ProductCounts>;
	isCountsLoading: boolean;
	showArchivedProducts?: boolean;
}) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [deleteDialog, setDeleteDialog] = useState<{
		open: boolean;
		product: ProductV2 | null;
	}>({ open: false, product: null });

	const handleDeleteClick = useCallback((product: ProductV2) => {
		setDeleteDialog({ open: true, product });
	}, []);

	const licenses = useMemo<LicenseWithCount[]>(
		() =>
			licenseProducts
				.filter((product) =>
					showArchivedProducts ? product.archived : !product.archived,
				)
				.map((product) => ({
					...product,
					active_count: counts[product.id]?.active ?? 0,
				})),
		[licenseProducts, counts, showArchivedProducts],
	);

	const columns = useMemo(
		() => createProductListColumns({ onDeleteClick: handleDeleteClick }),
		[handleDeleteClick],
	);

	const table = useProductTable({
		data: licenses,
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
			enableSorting: true,
			state: { sorting },
			onSortingChange: setSorting,
			getRowId: (row: LicenseWithCount) => row.id,
		},
	});

	if (licenses.length === 0) return null;

	return (
		<>
			<Table.Provider
				config={{
					table,
					numberOfColumns: columns.length,
					enableSorting: true,
					isLoading: isCountsLoading,
					getRowHref: (product: LicenseWithCount) =>
						pushPage({ path: `/products/${product.id}` }),
					rowClassName: "h-10",
				}}
			>
				<Table.Container>
					<LicenseSectionTag className="mt-4" />
					<Table.Content>
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</Table.Provider>

			{deleteDialog.product && (
				<DeletePlanDialog
					propProduct={deleteDialog.product}
					open={deleteDialog.open}
					setOpen={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
				/>
			)}
		</>
	);
}
