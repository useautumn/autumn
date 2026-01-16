import { AppEnv, type Entity, type FullCusProduct } from "@autumn/shared";
import { ArrowSquareOutIcon, PackageIcon } from "@phosphor-icons/react";
import type { Row } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useEnv } from "@/utils/envUtils";
import { useFullCusSearchQuery } from "@/views/customers/hooks/useFullCusSearchQuery";
import { useSavedViewsQuery } from "@/views/customers/hooks/useSavedViewsQuery";
import { useCustomerProductsData } from "@/views/customers2/hooks/useCustomerProductsData";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { AttachProductSheetTrigger } from "./AttachProductSheetTrigger";
import { CancelProductDialog } from "./CancelProductDialog";
import { CustomerProductsColumns } from "./CustomerProductsColumns";
import { ShowExpiredActionButton } from "./ShowExpiredActionButton";
import { TransferProductDialog } from "./TransferProductDialog";

export function CustomerProductsTable() {
	const env = useEnv();
	const {
		customer,
		isLoading,
		showExpired,
		setShowExpired,
		subscriptions,
		hasEntities,
		purchases,
	} = useCustomerProductsData();

	const { setEntityId } = useEntity();
	const [cancelOpen, setCancelOpen] = useState(false);
	const [transferOpen, setTransferOpen] = useState(false);
	const [selectedProduct, setSelectedProduct] = useState<FullCusProduct | null>(
		null,
	);
	const selectedItemId = useSheetStore((s) => s.itemId);

	useSavedViewsQuery();
	useFullCusSearchQuery();

	// Build columns dynamically - include Scope column only when there are entity products
	const columns = useMemo(() => {
		const baseColumns = [
			CustomerProductsColumns[0], // Name
		];

		// Add Scope column if there are entity products
		if (subscriptions.hasEntityProducts) {
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
			CustomerProductsColumns[4], // Actions
		);

		return baseColumns;
	}, [subscriptions.hasEntityProducts, customer.entities, setEntityId]);

	const setSheet = useSheetStore((s) => s.setSheet);

	const handleCancelClick = (product: FullCusProduct) => {
		setSelectedProduct(product);
		setCancelOpen(true);
	};

	const handleTransferClick = (product: FullCusProduct) => {
		setSelectedProduct(product);
		setTransferOpen(true);
	};

	const handleRowClick = (cusProduct: FullCusProduct) => {
		setSheet({
			type: "subscription-detail",
			itemId: cusProduct.id,
		});
	};

	const tableMeta = {
		onCancelClick: handleCancelClick,
		onTransferClick: handleTransferClick,
		hasEntities,
	};

	const table = useCustomerTable({
		data: subscriptions.all,
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
			meta: tableMeta,
		},
	});

	// Check if there are any purchases (for empty state messaging)
	const hasPurchases = purchases.all.length > 0;

	const emptyStateChildren =
		subscriptions.hasEntityProducts || hasPurchases ? (
			"No subscriptions found"
		) : (
			<>
				Enable a plan to start a subscription
				{env === AppEnv.Sandbox && (
					<IconButton
						variant="muted"
						size="sm"
						iconOrientation="right"
						icon={<ArrowSquareOutIcon size={16} className="-translate-y-px" />}
						className="px-1! ml-2"
						onClick={() =>
							window.open(
								"https://docs.useautumn.com/documentation/getting-started/setup/react",
								"_blank",
							)
						}
					>
						Docs
					</IconButton>
				)}
			</>
		);

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
					emptyStateChildren,
					flexibleTableColumns: true,
					selectedItemId,
				}}
			>
				<Table.Container>
					<Table.Toolbar>
						<Table.Heading>
							<PackageIcon size={16} weight="fill" className="text-subtle" />
							Subscriptions
						</Table.Heading>
						<Table.Actions>
							<ShowExpiredActionButton
								showExpired={showExpired}
								setShowExpired={setShowExpired}
							/>
							<AttachProductSheetTrigger />
						</Table.Actions>
					</Table.Toolbar>
					<Table.Content>
						<Table.Header />
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</Table.Provider>
		</div>
	);
}
