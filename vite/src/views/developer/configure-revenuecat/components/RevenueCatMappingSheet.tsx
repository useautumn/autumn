import type { ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Table } from "@/components/general/table";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { Sheet, SheetContent } from "@/components/v2/sheets/Sheet";
import { useRCMappings } from "@/hooks/queries/revcat/useRCMappings";
import { useRCProducts } from "@/hooks/queries/revcat/useRCProducts";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductTable } from "@/views/products/hooks/useProductTable";

interface ProductMapping {
	autumnProductId: string;
	autumnProductName: string;
	revenueCatProductIds: string[];
}

interface RevenueCatMappingSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function RevenueCatMappingSheet({
	open,
	onOpenChange,
}: RevenueCatMappingSheetProps) {
	const { products } = useProductsQuery();
	const { products: rcProducts } = useRCProducts();
	const {
		mappings: existingMappings,
		saveMappings,
		isSaving,
	} = useRCMappings();
	const [mappings, setMappings] = useState<ProductMapping[]>([]);

	useEffect(() => {
		if (open && products) {
			// Group products by ID and get the latest version of each
			const productMap = new Map<string, (typeof products)[0]>();

			for (const product of products) {
				const existing = productMap.get(product.id);
				if (!existing || product.version > existing.version) {
					productMap.set(product.id, product);
				}
			}

			const latestProducts = Array.from(productMap.values());
			const initialMappings = latestProducts.map((product) => {
				// Find existing mapping for this product
				const existingMapping = existingMappings.find(
					(m) => m.autumn_product_id === product.id,
				);
				return {
					autumnProductId: product.id,
					autumnProductName: product.name,
					revenueCatProductIds: existingMapping?.revenuecat_product_ids || [],
				};
			});
			setMappings(initialMappings);
		}
	}, [open, products, existingMappings]);

	const handleAddProduct = (
		autumnProductId: string,
		revenueCatProductId: string,
	) => {
		setMappings((prev) =>
			prev.map((mapping) =>
				mapping.autumnProductId === autumnProductId
					? {
							...mapping,
							revenueCatProductIds: [
								...mapping.revenueCatProductIds,
								revenueCatProductId,
							],
						}
					: mapping,
			),
		);
	};

	const handleRemoveProduct = (
		autumnProductId: string,
		revenueCatProductId: string,
	) => {
		setMappings((prev) =>
			prev.map((mapping) =>
				mapping.autumnProductId === autumnProductId
					? {
							...mapping,
							revenueCatProductIds: mapping.revenueCatProductIds.filter(
								(id) => id !== revenueCatProductId,
							),
						}
					: mapping,
			),
		);
	};

	// Get already mapped RevenueCat products (flatten all arrays)
	const getMappedRevenueCatProducts = (excludeAutumnProductId?: string) => {
		return mappings
			.filter((m) => m.autumnProductId !== excludeAutumnProductId)
			.flatMap((m) => m.revenueCatProductIds);
	};

	const columns: ColumnDef<ProductMapping>[] = useMemo(
		() => [
			{
				header: "Autumn Product",
				accessorKey: "autumnProductName",
				size: 200,
				cell: ({ row }) => {
					return (
						<div className="font-medium text-t2">
							{row.original.autumnProductName}
						</div>
					);
				},
			},
			{
				header: "RevenueCat Products",
				accessorKey: "revenueCatProductIds",
				size: 350,
				cell: ({ row }) => {
					const mappedRevenueCatProducts = getMappedRevenueCatProducts(
						row.original.autumnProductId,
					);
					const selectedProducts = row.original.revenueCatProductIds;

					return (
						<div className="flex flex-col gap-2 py-1 min-w-0 overflow-hidden">
							{/* Display selected products as tags */}
							{selectedProducts.length > 0 && (
								<div className="flex flex-wrap gap-1 min-w-0">
									{selectedProducts.map((productId) => {
										const product = rcProducts.find((p) => p.id === productId);
										return (
											<div
												key={productId}
												className="flex items-center gap-1 border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 rounded-lg pl-3 pr-2 py-1 text-xs"
											>
												<span className="text-tiny">
													{product?.name || productId}
												</span>
												<button
													type="button"
													onClick={() =>
														handleRemoveProduct(
															row.original.autumnProductId,
															productId,
														)
													}
													className="hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-sm p-0.5 transition-colors"
												>
													<X size={12} className="size-3 text-t4" />
												</button>
											</div>
										);
									})}
								</div>
							)}

							{/* Select to add more products */}
							<Select
								value="__add__"
								onValueChange={(value) => {
									if (value !== "__add__") {
										handleAddProduct(row.original.autumnProductId, value);
									}
								}}
							>
								<SelectTrigger className="w-full min-w-0">
									<SelectValue placeholder="Add product..." />
								</SelectTrigger>
								<SelectContent>
									{rcProducts
										.filter(
											(p) =>
												!mappedRevenueCatProducts.includes(p.id) &&
												!selectedProducts.includes(p.id),
										)
										.map((product) => (
											<SelectItem key={product.id} value={product.id}>
												{product.name}
											</SelectItem>
										))}
								</SelectContent>
							</Select>
						</div>
					);
				},
			},
		],
		[mappings, rcProducts],
	);

	const table = useProductTable({
		data: mappings,
		columns,
		options: {
			enableSorting: false,
		},
	});

	const handleSaveCallback = async () => {
		// Check for duplicate RevenueCat products across all mappings
		const allRcProductIds = mappings.flatMap((m) => m.revenueCatProductIds);
		const duplicateRc = allRcProductIds.filter(
			(id, idx) => allRcProductIds.indexOf(id) !== idx,
		);
		if (duplicateRc.length > 0) {
			toast.error(
				"Each RevenueCat product can only be mapped to one Autumn product",
			);
			return;
		}

		try {
			await saveMappings(
				mappings.map((m) => ({
					autumn_product_id: m.autumnProductId,
					revenuecat_product_ids: m.revenueCatProductIds,
				})),
			);
			onOpenChange(false);
		} catch (_error) {
			// Error handled by hook
		}
	};

	const handleCancel = () => {
		onOpenChange(false);
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex flex-col overflow-hidden">
				<SheetHeader
					title="Map RevenueCat Products"
					description="Connect your Autumn products to RevenueCat products"
					noSeparator
				/>

				<div className="flex-1 overflow-y-auto px-4 pt-4">
					<Table.Provider
						config={{
							table,
							numberOfColumns: columns.length,
							enableSorting: false,
							isLoading: false,
							flexibleTableColumns: true,
							emptyStateText:
								"No products found. Create products to map them to RevenueCat.",
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

				<SheetFooter>
					<ShortcutButton
						variant="secondary"
						className="w-full"
						onClick={handleCancel}
						singleShortcut="escape"
					>
						Cancel
					</ShortcutButton>
					<ShortcutButton
						className="w-full"
						onClick={handleSaveCallback}
						metaShortcut="enter"
						isLoading={isSaving}
					>
						Save mappings
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
