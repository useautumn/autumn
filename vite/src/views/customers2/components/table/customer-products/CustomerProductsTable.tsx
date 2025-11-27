import type { Entity, FullCusProduct } from "@autumn/shared";
import { Cube, Subtract, User } from "@phosphor-icons/react";
import type { Row } from "@tanstack/react-table";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Table } from "@/components/general/table";
import { Button } from "@/components/v2/buttons/Button";
import { pushPage } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useFullCusSearchQuery } from "@/views/customers/hooks/useFullCusSearchQuery";
import { useSavedViewsQuery } from "@/views/customers/hooks/useSavedViewsQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
<<<<<<< HEAD
import { AdminHover } from "../../../../../components/general/AdminHover";
import { getCusProductHoverTexts } from "../../../../admin/adminUtils";
import { AttachProductDropdown } from "./AttachProductDropdown";
=======
import { AttachProductSheetTrigger } from "./AttachProductSheetTrigger";
>>>>>>> d5005b5e71e54cb3fadec68820bc156f1966918a
import { CancelProductDialog } from "./CancelProductDialog";
import { CustomerProductPrice } from "./CustomerProductPrice";
import { CustomerProductsColumns } from "./CustomerProductsColumns";
import { filterCustomerProductsByEntity } from "./customerProductsTableFilters";
import { ShowExpiredActionButton } from "./ShowExpiredActionButton";

export function CustomerProductsTable() {
	const { customer, isLoading } = useCusQuery();
	const { entityId } = useCustomerContext();

	const [showExpired, setShowExpired] = useQueryState(
		"customerProductsShowExpired",
		parseAsBoolean.withDefault(false),
	);

	const [cancelOpen, setCancelOpen] = useState(false);
	const [selectedProduct, setSelectedProduct] = useState<FullCusProduct | null>(
		null,
	);

	useSavedViewsQuery();
	useFullCusSearchQuery();

	const { regularProducts, entityProducts } = useMemo(
		() =>
			filterCustomerProductsByEntity({
				customer,
				showExpired: showExpired ?? false,
			}),
		[customer, showExpired],
	);

	const displayedProducts = useMemo(() => {
		if (entityId) {
			const selectedEntity = customer.entities.find(
				(e: Entity) => e.id === entityId || e.internal_id === entityId,
			);
			if (selectedEntity) {
				const matchingEntityProducts = entityProducts.filter(
					(product) =>
						product.internal_entity_id === selectedEntity.internal_id ||
						product.entity_id === selectedEntity.id,
				);
				return [...regularProducts, ...matchingEntityProducts];
			}
		}
		return regularProducts;
	}, [regularProducts, entityProducts, entityId, customer.entities]);

	const attachedProductsTableColumns = useMemo(
		() => CustomerProductsColumns,
		[],
	);

	const navigate = useNavigate();
	const location = useLocation();

	const entityProductsTableColumns = useMemo(
		() => [
			{
				header: "Entity",
				accessorKey: "entity",
				cell: ({ row }: { row: Row<FullCusProduct> }) => {
					const product = row.original;
					const entity = customer.entities.find(
						(e: Entity) =>
							e.internal_id === product.internal_entity_id ||
							e.id === product.entity_id,
					);

					const handleEntityClick = (e: React.MouseEvent) => {
						e.stopPropagation();
						if (!entity) return;
						const params = new URLSearchParams(location.search);
						params.set("entity_id", entity.id || entity.internal_id);
						navigate(`${location.pathname}?${params.toString()}`);
					};

					if (!entity) return <span className="text-t3">—</span>;

					return (
						<Button
							variant="skeleton"
							onClick={handleEntityClick}
							className="text-t1 font-medium hover:text-purple-600 cursor-pointer max-w-full px-0! hover:bg-transparent active:bg-transparent active:border-none"
						>
							<span className="truncate w-full">
								{entity.name || entity.id || entity.internal_id}
							</span>
						</Button>
					);
				},
			},
			{
				header: "Name",
				accessorKey: "name",
				cell: ({ row }: { row: Row<FullCusProduct> }) => {
					const quantity = row.original.quantity;
					const showQuantity = quantity && quantity > 1;

					return (
						<div className="font-semibold flex items-center gap-2">
							<AdminHover texts={getCusProductHoverTexts(row.original)}>
								{row.original.product.name}
							</AdminHover>

							{showQuantity && (
								<div className="text-t3 bg-muted rounded-sm p-1 py-0">
									{quantity}
								</div>
							)}
						</div>
					);
				},
			},
			{
				header: "Price",
				accessorKey: "price",
				cell: ({ row }: { row: Row<FullCusProduct> }) => {
					return <CustomerProductPrice cusProduct={row.original} />;
				},
			},
			CustomerProductsColumns[2], // Status
			CustomerProductsColumns[3], // Created At
			CustomerProductsColumns[4], // Actions
		],
		[customer.entities, location.pathname, location.search, navigate],
	);

	const handleCancelClick = (product: FullCusProduct) => {
		setSelectedProduct(product);
		setCancelOpen(true);
	};

	const handleRowClick = (cusProduct: FullCusProduct) => {
		const entity = customer.entities.find(
			(e: Entity) =>
				e.internal_id === cusProduct.internal_entity_id ||
				e.id === cusProduct.entity_id,
		);

		pushPage({
			path: `/customers/${customer.id || customer.internal_id}/${cusProduct.product_id}`,
			queryParams: {
				id: cusProduct.id,
				entity_id: entity ? entity.id || entity.internal_id : undefined,
			},
			navigate,
		});
	};

	const enableSorting = false;
	const table = useCustomerTable({
		data: displayedProducts,
		columns: attachedProductsTableColumns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
			meta: {
				onCancelClick: handleCancelClick,
			},
		},
	});

	const entityTable = useCustomerTable({
		data: entityProducts,
		columns: entityProductsTableColumns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
			meta: {
				onCancelClick: handleCancelClick,
			},
		},
	});

	const hasEntityProducts = entityProducts.length > 0 && !entityId;

	const emptyStateText =
		!entityId && entityProducts.length > 0
			? "No customer-level plans found"
			: "Enable a plan to start a subscription";

	return (
		<div className="flex flex-col gap-4">
			{selectedProduct && (
				<CancelProductDialog
					cusProduct={selectedProduct}
					open={cancelOpen}
					setOpen={setCancelOpen}
				/>
			)}
			<Table.Provider
				config={{
					table,
					numberOfColumns: attachedProductsTableColumns.length,
					enableSorting,
					isLoading,
					onRowClick: handleRowClick,
					emptyStateText,
				}}
			>
				<Table.Container>
					<Table.Toolbar>
						<Table.Heading>
							<Cube size={16} weight="fill" className="text-subtle" />
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
					{hasEntityProducts && (
						<div className="text-t3 text-sm py-0 px-2 rounded-lg flex gap-2 items-center mb-3 w-fit">
							<User size={14} weight="fill" className="text-subtle" />
							Customer Plans
						</div>
					)}
					{/* {hasProducts ? ( */}
					<Table.Content>
						<Table.Header />
						<Table.Body />
					</Table.Content>
					{/* ) : (
						!isLoading && (
							<EmptyState
								text={
									entityProducts.length > 0
										? "No customer-level plans."
										: "Enable a plan to start a subscription"
								}
							/>
						)
					)} */}
				</Table.Container>
			</Table.Provider>
			{hasEntityProducts && (
				<div>
					<div className="text-t3 text-sm py-0 px-2 rounded-lg flex gap-2 items-center mb-3 w-fit">
						<Subtract size={14} weight="fill" className="text-subtle" />
						Entity Plans
					</div>
					<Table.Provider
						config={{
							table: entityTable,
							numberOfColumns: entityProductsTableColumns.length,
							enableSorting,
							isLoading,
							onRowClick: handleRowClick,
						}}
					>
						<Table.Container>
							<Table.Content>
								<Table.Header />
								<Table.Body />
							</Table.Content>
						</Table.Container>
					</Table.Provider>
				</div>
			)}
		</div>
	);
}
