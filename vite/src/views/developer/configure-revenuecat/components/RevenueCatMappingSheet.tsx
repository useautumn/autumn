import { isFeaturePriceItem } from "@autumn/shared";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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

interface ProductMapping {
	autumnProductId: string;
	autumnProductName: string;
	revenueCatProductIds: string[];
}

interface RevenueCatMappingSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

interface RCProduct {
	id: string;
	name: string;
}

function MappingRow({
	mapping,
	rcProducts,
	getMappedRevenueCatProducts,
	onAddProduct,
	onRemoveProduct,
}: {
	mapping: ProductMapping;
	rcProducts: RCProduct[];
	getMappedRevenueCatProducts: (excludeAutumnProductId?: string) => string[];
	onAddProduct: (autumnProductId: string, revenueCatProductId: string) => void;
	onRemoveProduct: (
		autumnProductId: string,
		revenueCatProductId: string,
	) => void;
}) {
	const mappedRevenueCatProducts = getMappedRevenueCatProducts(
		mapping.autumnProductId,
	);
	const selectedProducts = mapping.revenueCatProductIds;
	const availableProducts = rcProducts.filter(
		(p) =>
			!mappedRevenueCatProducts.includes(p.id) &&
			!selectedProducts.includes(p.id),
	);

	return (
		<div className="flex flex-col gap-2 p-3 border border-zinc-200 dark:border-zinc-800 rounded-lg">
			<div className="font-medium text-t2">{mapping.autumnProductName}</div>

			{/* Display selected products as tags */}
			{selectedProducts.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{selectedProducts.map((productId) => {
						const product = rcProducts.find((p) => p.id === productId);
						return (
							<div
								key={productId}
								className="flex items-center gap-1 border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 rounded-lg pl-3 pr-2 py-1 text-xs"
							>
								<span className="text-tiny">{product?.name || productId}</span>
								<button
									type="button"
									onClick={() =>
										onRemoveProduct(mapping.autumnProductId, productId)
									}
									className="hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-sm p-0.5 transition-colors cursor-pointer"
								>
									<X size={12} className="size-3 text-t4" />
								</button>
							</div>
						);
					})}
				</div>
			)}

			{/* Select to add more products */}
			{availableProducts.length === 0 ? (
				<div className="text-t3 text-xs py-1">
					All products mapped or none available. Please ensure you have created
					products in RevenueCat before mapping.
				</div>
			) : (
				<Select
					value=""
					onValueChange={(value) => {
						if (value) {
							onAddProduct(mapping.autumnProductId, value);
						}
					}}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Add product..." />
					</SelectTrigger>
					<SelectContent>
						{availableProducts.map((product) => (
							<SelectItem key={product.id} value={product.id}>
								{product.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
		</div>
	);
}

export function RevenueCatMappingSheet({
	open,
	onOpenChange,
}: RevenueCatMappingSheetProps) {
	const { products } = useProductsQuery({
		filter(product) {
			const isPrepaid = product.items.some(isFeaturePriceItem);
			return !isPrepaid;
		},
	});
	const { products: rcProducts } = useRCProducts();
	const {
		mappings: existingMappings,
		saveMappings,
		isSaving,
	} = useRCMappings();
	const [mappings, setMappings] = useState<ProductMapping[]>([]);
	const [initialized, setInitialized] = useState(false);

	useEffect(() => {
		// Only initialize once when opening the sheet
		if (open && products && !initialized) {
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
			setInitialized(true);
		}

		// Reset initialized flag when sheet closes
		if (!open) {
			setInitialized(false);
		}
	}, [open, products, existingMappings, initialized]);

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
					{mappings.length === 0 ? (
						<div className="text-t3 text-sm text-center py-8">
							No products found. Create products to map them to RevenueCat.
						</div>
					) : (
						<div className="flex flex-col gap-4">
							{mappings.map((mapping) => (
								<MappingRow
									key={mapping.autumnProductId}
									mapping={mapping}
									rcProducts={rcProducts}
									getMappedRevenueCatProducts={getMappedRevenueCatProducts}
									onAddProduct={handleAddProduct}
									onRemoveProduct={handleRemoveProduct}
								/>
							))}
						</div>
					)}
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
