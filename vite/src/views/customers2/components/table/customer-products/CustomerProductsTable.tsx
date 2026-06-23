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
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerProductsPageQuery } from "@/views/customers2/hooks/useCustomerProductsPageQuery";
import {
	CUSTOMER_PRODUCTS_PAGE_SIZES,
	useCustomerProductsTableState,
} from "@/views/customers2/hooks/useCustomerProductsTableState";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { AttachProductSheetTrigger } from "./AttachProductSheetTrigger";
import { CustomerProductsColumns } from "./CustomerProductsColumns";
import { CustomerProductsFilterButton } from "./CustomerProductsFilterButton";
import { TransferProductDialog } from "./TransferProductDialog";

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
				return <span className="text-muted-foreground">Customer</span>;
			}

			const entity = product.internal_entity_id
				? entities.find(
						(e: Entity) => e.internal_id === product.internal_entity_id,
					)
				: entities.find((e: Entity) => e.id === product.entity_id);

			if (!entity) return <span className="text-tertiary-foreground">—</span>;

			return (
				<Button
					variant="skeleton"
					onClick={(e) => {
						e.stopPropagation();
						setEntityId(entity.internal_id);
					}}
					className="font-medium hover:text-purple-600 cursor-pointer max-w-full px-0! hover:bg-transparent active:bg-transparent active:border-none"
				>
					<span className="truncate w-full">
						{entity.name || entity.internal_id || "PENDING"}
					</span>
				</Button>
			);
		},
	};
}

export function CustomerProductsTable() {
	const env = useEnv();
	const { customer, testClockFrozenTimeMs } = useCusQuery();
	const { entityId, setEntityId } = useEntity();

	const tableState = useCustomerProductsTableState({ entityId });
	const {
		currentCursor,
		page,
		canGoBack,
		pushCursor,
		popCursor,
		pageSize,
		changePageSize,
		showExpired,
		setShowExpired,
		kind,
		setKind,
	} = tableState;

	const { products, nextCursor, totalCount, isLoading, isTransitioning } =
		useCustomerProductsPageQuery({
			cursor: currentCursor,
			pageSize,
			showExpired,
			kind,
			initialPage: customer.products_page,
		});

	const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : null;
	const showFooter = totalCount >= CUSTOMER_PRODUCTS_PAGE_SIZES[0];

	const [transferOpen, setTransferOpen] = useState(false);
	const [selectedProduct, setSelectedProduct] = useState<FullCusProduct | null>(
		null,
	);
	const selectedItemId = useSheetStore((s) => s.itemId);
	const setSheet = useSheetStore((s) => s.setSheet);

	const hasEntities = customer.entities.length > 0;

	const columns = useMemo(() => {
		const baseColumns = [CustomerProductsColumns[0]];

		if (hasEntities) {
			baseColumns.push(createScopeColumn(customer.entities, setEntityId));
		}

		baseColumns.push(
			CustomerProductsColumns[1],
			CustomerProductsColumns[2],
			CustomerProductsColumns[3],
			CustomerProductsColumns[4],
		);

		return baseColumns;
	}, [hasEntities, customer.entities, setEntityId]);

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

	const handleUpdateClick = (product: FullCusProduct) => {
		setSheet({ type: "subscription-update", itemId: product.id });
	};

	const handleRowClick = (cusProduct: FullCusProduct) => {
		setSheet({ type: "subscription-detail", itemId: cusProduct.id });
	};

	const productsTable = useCustomerTable({
		data: products,
		columns,
		options: {
			meta: {
				onCancelClick: handleCancelClick,
				onUncancelClick: handleUncancelClick,
				onTransferClick: handleTransferClick,
				onUpdateClick: handleUpdateClick,
				hasEntities,
				nowMs: testClockFrozenTimeMs,
			},
		},
	});

	const emptyStateChildren =
		kind === "all" ? (
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
								"https://docs.useautumn.com/documentation/getting-started/setup",
								"_blank",
							)
						}
					>
						Docs
					</IconButton>
				)}
			</>
		) : (
			"No plans found"
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

			<Table.Provider
				config={{
					table: productsTable,
					numberOfColumns: columns.length,
					enableSorting: false,
					isLoading,
					isTransitioning,
					onRowClick: handleRowClick,
					emptyStateChildren,
					flexibleTableColumns: true,
					mobileCards: true,
					selectedItemId,
					virtualization: { containerHeight: "428px", skeletonRowCount: 3 },
				}}
			>
				<Table.Container>
					<Table.Toolbar>
						<Table.Heading>
							<PackageIcon size={16} weight="fill" className="text-subtle" />
							Plans
						</Table.Heading>
						<Table.Actions>
							<CustomerProductsFilterButton
								kind={kind}
								setKind={setKind}
								showExpired={showExpired}
								setShowExpired={setShowExpired}
							/>
							<AttachProductSheetTrigger />
						</Table.Actions>
					</Table.Toolbar>
					<Table.VirtualizedContent>
						<Table.VirtualizedBody />
					</Table.VirtualizedContent>
					{showFooter && (
						<Table.PaginationFooter
							currentPage={page}
							totalPages={totalPages}
							totalCount={totalCount}
							canGoPrev={canGoBack}
							canGoNext={!!nextCursor}
							onPrev={popCursor}
							onNext={() => nextCursor && pushCursor(nextCursor)}
							pageSize={pageSize}
							pageSizeOptions={CUSTOMER_PRODUCTS_PAGE_SIZES}
							onPageSizeChange={(size) =>
								changePageSize(
									size as (typeof CUSTOMER_PRODUCTS_PAGE_SIZES)[number],
								)
							}
							disabled={isTransitioning}
						/>
					)}
				</Table.Container>
			</Table.Provider>
		</div>
	);
}
