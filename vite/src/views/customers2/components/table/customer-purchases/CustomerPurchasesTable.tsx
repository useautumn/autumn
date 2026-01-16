import type { Entity, FullCusProduct } from "@autumn/shared";
import { SectionTag } from "@/components/v2/badges/SectionTag";
import type { Row } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { Button } from "@/components/v2/buttons/Button";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useCustomerProductsData } from "@/views/customers2/hooks/useCustomerProductsData";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { CancelProductDialog } from "../customer-products/CancelProductDialog";
import { CustomerProductsColumns } from "../customer-products/CustomerProductsColumns";
import { TransferProductDialog } from "../customer-products/TransferProductDialog";

export function CustomerPurchasesTable() {
	const { customer, isLoading, purchases, hasEntities } =
		useCustomerProductsData();
	const { setEntityId } = useEntity();
	const selectedItemId = useSheetStore((s) => s.itemId);
	const setSheet = useSheetStore((s) => s.setSheet);
	const [cancelOpen, setCancelOpen] = useState(false);
	const [transferOpen, setTransferOpen] = useState(false);
	const [selectedProduct, setSelectedProduct] = useState<FullCusProduct | null>(
		null,
	);

	// Build columns dynamically - include Scope column only when there are entity products
	const columns = useMemo(() => {
		const baseColumns = [
			CustomerProductsColumns[0], // Name
		];

		// Add Scope column if there are entity products
		if (purchases.hasEntityProducts) {
			baseColumns.push({
				header: "Scope",
				accessorKey: "scope",
				cell: ({ row }: { row: Row<FullCusProduct> }) => {
					const product = row.original;

					// If no entity, it's customer-level
					if (!product.internal_entity_id && !product.entity_id) {
						return <span className="text-t3">Customer</span>;
					}

					// Find the entity
					const entity = customer.entities.find(
						(e: Entity) =>
							e.internal_id === product.internal_entity_id ||
							e.id === product.entity_id,
					);

					if (!entity) return <span className="text-t3">—</span>;

					return (
						<Button
							variant="skeleton"
							onClick={(e) => {
								e.stopPropagation();
								setEntityId(entity.id || entity.internal_id);
							}}
							className="font-medium hover:text-purple-600 cursor-pointer max-w-full px-0! hover:bg-transparent active:bg-transparent active:border-none"
						>
							<span className="truncate w-full">
								{entity.name || entity.id || entity.internal_id}
							</span>
						</Button>
					);
				},
			});
		}

		// Add remaining columns
		baseColumns.push(
			CustomerProductsColumns[1], // Price
			CustomerProductsColumns[2], // Status
			CustomerProductsColumns[3], // Created At
			CustomerProductsColumns[4], // Actions (empty for purchases, but keeps layout consistent)
		);

		return baseColumns;
	}, [purchases.hasEntityProducts, customer.entities, setEntityId]);

	const handleCancelClick = (product: FullCusProduct) => {
		setSelectedProduct(product);
		setCancelOpen(true);
	};

	const handleTransferClick = (product: FullCusProduct) => {
		setSelectedProduct(product);
		setTransferOpen(true);
	};

	const tableMeta = {
		onCancelClick: handleCancelClick,
		onTransferClick: handleTransferClick,
		hasEntities,
	};

	const table = useCustomerTable({
		data: purchases.all,
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
			meta: tableMeta,
		},
	});

	const handleRowClick = (cusProduct: FullCusProduct) => {
		setSheet({
			type: "subscription-detail",
			itemId: cusProduct.id,
		});
	};

	const hasPurchases = purchases.all.length > 0;

	if (!hasPurchases) return null;

	return (
		<div className="flex flex-col gap-4">
			{selectedProduct && (
				<>
					<CancelProductDialog
						cusProduct={selectedProduct}
						open={cancelOpen}
						setOpen={setCancelOpen}
					/>
					<TransferProductDialog
						cusProduct={selectedProduct}
						open={transferOpen}
						setOpen={setTransferOpen}
					/>
				</>
			)}
			<Table.Provider
				config={{
					table,
					numberOfColumns: columns.length,
					enableSorting: false,
					isLoading,
					onRowClick: handleRowClick,
					emptyStateText: "No purchases found",
					flexibleTableColumns: true,
					selectedItemId,
				}}
			>
				<Table.Container>


						<SectionTag>Purchases</SectionTag>
					<Table.Content>
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</Table.Provider>
		</div>
	);
}
