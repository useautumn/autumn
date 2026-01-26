import { AppEnv, type Entity, type FullCusProduct } from "@autumn/shared";
import { ArrowSquareOutIcon, PackageIcon } from "@phosphor-icons/react";
import type { Row } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { Table } from "@/components/general/table";
import { SectionTag } from "@/components/v2/badges/SectionTag";
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
import { CustomerProductsColumns } from "./CustomerProductsColumns";
import { ShowExpiredActionButton } from "./ShowExpiredActionButton";
import { TransferProductDialog } from "./TransferProductDialog";

// Shared scope column factory
function createScopeColumn(
	entities: Entity[],
	setEntityId: (id: string) => void,
) {
	return {
		header: "Scope",
		accessorKey: "scope",
		cell: ({ row }: { row: Row<FullCusProduct> }) => {
			const product = row.original;

			if (!product.internal_entity_id && !product.entity_id) {
				return <span className="text-t2">Customer</span>;
			}

			const entity = entities.find(
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
	};
}

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
	const [transferOpen, setTransferOpen] = useState(false);
	const [selectedProduct, setSelectedProduct] = useState<FullCusProduct | null>(
		null,
	);
	const selectedItemId = useSheetStore((s) => s.itemId);
	const setSheet = useSheetStore((s) => s.setSheet);

	useSavedViewsQuery();
	useFullCusSearchQuery();

	const hasPurchases = purchases.all.length > 0;
	const hasEntityProducts =
		subscriptions.hasEntityProducts || purchases.hasEntityProducts;

	// Build columns - same for both tables to keep them consistent
	const columns = useMemo(() => {
		const baseColumns = [CustomerProductsColumns[0]];

		if (hasEntityProducts) {
			baseColumns.push(createScopeColumn(customer.entities, setEntityId));
		}

		baseColumns.push(
			CustomerProductsColumns[1],
			CustomerProductsColumns[2],
			CustomerProductsColumns[3],
			CustomerProductsColumns[4],
		);

		return baseColumns;
	}, [hasEntityProducts, customer.entities, setEntityId]);

	const handleCancelClick = (product: FullCusProduct) => {
		setSheet({ type: "subscription-cancel", itemId: product.id });
	};

	const handleTransferClick = (product: FullCusProduct) => {
		setSelectedProduct(product);
		setTransferOpen(true);
	};

	const handleUncancelClick = (product: FullCusProduct) => {
		setSheet({ type: "subscription-uncancel", itemId: product.id });
	};

	const handleRowClick = (cusProduct: FullCusProduct) => {
		setSheet({
			type: "subscription-detail",
			itemId: cusProduct.id,
		});
	};

	const tableMeta = {
		onCancelClick: handleCancelClick,
		onUncancelClick: handleUncancelClick,
		onTransferClick: handleTransferClick,
		hasEntities,
	};

	const subscriptionTable = useCustomerTable({
		data: subscriptions.all,
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
			meta: tableMeta,
		},
	});

	const purchaseTable = useCustomerTable({
		data: purchases.all,
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
			meta: tableMeta,
		},
	});

	const emptyStateChildren =
		hasEntityProducts || hasPurchases ? (
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
		<div className="flex flex-col gap-6">
			{selectedProduct && (
				<TransferProductDialog
					cusProduct={selectedProduct}
					open={transferOpen}
					setOpen={setTransferOpen}
				/>
			)}

			{/* Subscriptions Table */}
			<Table.Provider
				config={{
					table: subscriptionTable,
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
							Plans
						</Table.Heading>
						<Table.Actions>
							<ShowExpiredActionButton
								showExpired={showExpired}
								setShowExpired={setShowExpired}
							/>
							<AttachProductSheetTrigger />
						</Table.Actions>
					</Table.Toolbar>
					{hasPurchases && <SectionTag>Subscriptions</SectionTag>}
					<Table.Content>
						<Table.Header />
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</Table.Provider>

			{/* Purchases Table - only rendered if there are purchases */}
			{hasPurchases && (
				<Table.Provider
					config={{
						table: purchaseTable,
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
			)}
		</div>
	);
}
