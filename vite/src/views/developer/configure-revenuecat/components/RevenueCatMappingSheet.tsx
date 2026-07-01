import {
	getPrepaidDisplayQuantity,
	type ProductV2,
	UsageModel,
} from "@autumn/shared";
import {
	FormLabel,
	IconButton,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Sheet,
	SheetContent,
	ShortcutButton,
} from "@autumn/ui";
import { X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import {
	type RCFeatureQuantities,
	useRCMappings,
} from "@/hooks/queries/revcat/useRCMappings";
import { useRCProducts } from "@/hooks/queries/revcat/useRCProducts";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { getPrepaidItems } from "@/utils/product/productItemUtils";

// Metered / usage-based feature-price items bill at runtime, which the RC attach
// path (no_billing_changes) can't collect. Only prepaid feature-prices are
// supported, so exclude products carrying any non-prepaid feature-price item.
const hasUnsupportedUsagePrice = (product: ProductV2): boolean =>
	product.items?.some(
		(item) =>
			isFeaturePriceItem(item) && item.usage_model !== UsageModel.Prepaid,
	) ?? false;

interface PrepaidFeature {
	featureId: string;
	billingUnits: number;
}

// rcProductId -> featureId -> packs (UI holds packs; saved as feature units)
type FeaturePacks = Record<string, Record<string, number | undefined>>;

interface ProductMapping {
	autumnProductId: string;
	autumnProductName: string;
	revenueCatProductIds: string[];
	featurePacks: FeaturePacks;
}

interface RevenueCatMappingSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

interface RCProduct {
	id: string;
	name: string;
	platforms: string[];
}

// Show the store identifier alongside the (possibly grouped, possibly empty)
// display name, plus the platforms it spans, e.g.
// "Annual, Annual (annual) [ios/android]". Falls back to just the id when the
// product has no display name so the option is never blank.
function formatRcProductLabel(product: RCProduct): string {
	const base = product.name ? `${product.name} (${product.id})` : product.id;
	if (product.platforms.length === 0) {
		return base;
	}
	return `${base} [${product.platforms.join("/")}]`;
}

function AddRcProductSelect({
	availableProducts,
	hasNoRcProducts,
	onAdd,
}: {
	availableProducts: RCProduct[];
	hasNoRcProducts: boolean;
	onAdd: (revenueCatProductId: string) => void;
}) {
	if (hasNoRcProducts) {
		return (
			<div className="text-tertiary-foreground text-xs py-1">
				No RevenueCat products found. Create products in RevenueCat before
				mapping.
			</div>
		);
	}
	if (availableProducts.length === 0) {
		return (
			<div className="text-tertiary-foreground text-xs py-1">
				All RevenueCat products are already mapped to Autumn products. Remove an
				existing mapping to change assignments.
			</div>
		);
	}
	return (
		<Select
			value=""
			onValueChange={(value) => {
				if (value) {
					onAdd(value);
				}
			}}
			items={Object.fromEntries(
				availableProducts.map((product) => [
					product.id,
					formatRcProductLabel(product),
				]),
			)}
		>
			<SelectTrigger className="w-full">
				<SelectValue placeholder="Add product..." />
			</SelectTrigger>
			<SelectContent>
				{availableProducts.map((product) => (
					<SelectItem key={product.id} value={product.id}>
						{formatRcProductLabel(product)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

const MappingRow = memo(function MappingRow({
	mapping,
	rcProducts,
	mappedRevenueCatProductIds,
	onAddProduct,
	onRemoveProduct,
}: {
	mapping: ProductMapping;
	rcProducts: RCProduct[];
	mappedRevenueCatProductIds: string[];
	onAddProduct: (autumnProductId: string, revenueCatProductId: string) => void;
	onRemoveProduct: (
		autumnProductId: string,
		revenueCatProductId: string,
	) => void;
}) {
	const selectedProducts = mapping.revenueCatProductIds;
	const availableProducts = rcProducts.filter(
		(p) =>
			!mappedRevenueCatProductIds.includes(p.id) &&
			!selectedProducts.includes(p.id),
	);

	return (
		<div className="flex flex-col gap-2 p-3 border border-zinc-200 dark:border-zinc-800 rounded-lg">
			<div className="flex items-center gap-2">
				<span className="font-medium text-muted-foreground">
					{mapping.autumnProductName}
				</span>
				<span className="text-tiny-id text-tertiary-foreground bg-muted px-1.5 py-0.5 rounded-md">
					{mapping.autumnProductId}
				</span>
			</div>

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
								<span className="text-tiny">
									{product ? formatRcProductLabel(product) : productId}
								</span>
								<button
									type="button"
									onClick={() =>
										onRemoveProduct(mapping.autumnProductId, productId)
									}
									className="hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-sm p-0.5 transition-colors cursor-pointer"
								>
									<X size={12} className="size-3 text-subtle" />
								</button>
							</div>
						);
					})}
				</div>
			)}

			<AddRcProductSelect
				availableProducts={availableProducts}
				hasNoRcProducts={rcProducts.length === 0}
				onAdd={(value) => onAddProduct(mapping.autumnProductId, value)}
			/>
		</div>
	);
});

// Prepaid products map each RevenueCat SKU to a fixed quantity per prepaid
// feature. Input is in packs (1 pack = billing_units feature units); the live
// hint and the saved value convert packs -> feature units.
const PrepaidMappingRow = memo(function PrepaidMappingRow({
	mapping,
	rcProducts,
	prepaidFeatures,
	mappedRevenueCatProductIds,
	onAddProduct,
	onRemoveProduct,
	onPacksChange,
}: {
	mapping: ProductMapping;
	rcProducts: RCProduct[];
	prepaidFeatures: PrepaidFeature[];
	mappedRevenueCatProductIds: string[];
	onAddProduct: (autumnProductId: string, revenueCatProductId: string) => void;
	onRemoveProduct: (
		autumnProductId: string,
		revenueCatProductId: string,
	) => void;
	onPacksChange: (
		autumnProductId: string,
		revenueCatProductId: string,
		featureId: string,
		packs: number | undefined,
	) => void;
}) {
	const selectedProducts = mapping.revenueCatProductIds;
	const availableProducts = rcProducts.filter(
		(p) =>
			!mappedRevenueCatProductIds.includes(p.id) &&
			!selectedProducts.includes(p.id),
	);

	return (
		<div className="flex flex-col gap-2 p-3 border border-zinc-200 dark:border-zinc-800 rounded-lg">
			<div className="flex items-center gap-2">
				<span className="font-medium text-muted-foreground">
					{mapping.autumnProductName}
				</span>
				<span className="text-tiny-id text-tertiary-foreground bg-muted px-1.5 py-0.5 rounded-md">
					{mapping.autumnProductId}
				</span>
				<span className="text-tiny text-tertiary-foreground bg-muted px-1.5 py-0.5 rounded-md">
					prepaid
				</span>
			</div>

			<div className="text-tertiary-foreground text-xs">
				{prepaidFeatures.map((f) => (
					<span key={f.featureId} className="mr-3">
						1 pack of <span className="font-medium">{f.featureId}</span> ={" "}
						{f.billingUnits.toLocaleString()} units
					</span>
				))}
			</div>

			{selectedProducts.length > 0 && (
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<FormLabel className="flex-1">RevenueCat SKU</FormLabel>
						{prepaidFeatures.map((f) => (
							<FormLabel key={f.featureId} className="w-28">
								{f.featureId} (packs)
							</FormLabel>
						))}
						<span className="w-7" />
					</div>

					{selectedProducts.map((rcId) => {
						const rcProduct = rcProducts.find((p) => p.id === rcId);
						return (
							<div key={rcId} className="flex items-start gap-2">
								<span className="flex-1 text-tiny truncate pt-2" title={rcId}>
									{rcProduct ? formatRcProductLabel(rcProduct) : rcId}
								</span>
								{prepaidFeatures.map((f) => {
									const packs = mapping.featurePacks[rcId]?.[f.featureId];
									const units =
										packs === undefined
											? undefined
											: getPrepaidDisplayQuantity({
													quantity: packs,
													billingUnits: f.billingUnits,
												});
									return (
										<div
											key={f.featureId}
											className="w-28 flex flex-col gap-0.5"
										>
											<Input
												type="number"
												min={0}
												lang="en"
												value={packs ?? ""}
												placeholder="0"
												onChange={(e) =>
													onPacksChange(
														mapping.autumnProductId,
														rcId,
														f.featureId,
														e.target.value === ""
															? undefined
															: Number(e.target.value),
													)
												}
											/>
											{units !== undefined && (
												<span className="text-tiny text-tertiary-foreground">
													= {units.toLocaleString()} {f.featureId}
												</span>
											)}
										</div>
									);
								})}
								<IconButton
									variant="skeleton"
									iconOrientation="center"
									icon={<X />}
									onClick={() => onRemoveProduct(mapping.autumnProductId, rcId)}
								/>
							</div>
						);
					})}
				</div>
			)}

			<AddRcProductSelect
				availableProducts={availableProducts}
				hasNoRcProducts={rcProducts.length === 0}
				onAdd={(value) => onAddProduct(mapping.autumnProductId, value)}
			/>
		</div>
	);
});

export function RevenueCatMappingSheet({
	open,
	onOpenChange,
}: RevenueCatMappingSheetProps) {
	const { products: allProducts } = useProductsQuery();
	const { products: rcProducts } = useRCProducts();

	// Latest version of each product (stable identity for effects).
	const products = useMemo(() => {
		const productMap = new Map<string, ProductV2>();
		for (const product of allProducts) {
			const existing = productMap.get(product.id);
			if (!existing || product.version > existing.version) {
				productMap.set(product.id, product);
			}
		}
		return Array.from(productMap.values()).filter(
			(product) => !hasUnsupportedUsagePrice(product),
		);
	}, [allProducts]);

	// productId -> prepaid features (featureId + billing units). Presence here
	// switches the row to the per-SKU packs table.
	const prepaidInfoByProduct = useMemo(() => {
		const map = new Map<string, PrepaidFeature[]>();
		for (const product of products) {
			const prepaidItems = getPrepaidItems(product);
			if (prepaidItems.length === 0) continue;
			map.set(
				product.id,
				prepaidItems
					.filter((item) => item.feature_id)
					.map((item) => ({
						featureId: item.feature_id as string,
						billingUnits: item.billing_units ?? 1,
					})),
			);
		}
		return map;
	}, [products]);

	const {
		mappings: existingMappings,
		saveMappings,
		isSaving,
	} = useRCMappings();
	const [mappings, setMappings] = useState<ProductMapping[]>([]);
	const initializedRef = useRef(false);

	// Initialize mappings only once when sheet opens
	useEffect(() => {
		if (!open) {
			initializedRef.current = false;
			return;
		}

		if (initializedRef.current || !products || products.length === 0) {
			return;
		}

		const initialMappings = products.map((product) => {
			const existingMapping = existingMappings.find(
				(m) => m.autumn_product_id === product.id,
			);
			const prepaidFeatures = prepaidInfoByProduct.get(product.id) ?? [];

			// Stored feature_quantities are in feature units; show as packs.
			const featurePacks: FeaturePacks = {};
			const storedFq = existingMapping?.feature_quantities;
			if (storedFq) {
				for (const [rcId, fqs] of Object.entries(storedFq)) {
					for (const fq of fqs) {
						if (fq.quantity === undefined) continue;
						const feature = prepaidFeatures.find(
							(f) => f.featureId === fq.feature_id,
						);
						const billingUnits = feature?.billingUnits ?? 1;
						featurePacks[rcId] = {
							...(featurePacks[rcId] ?? {}),
							[fq.feature_id]: fq.quantity / billingUnits,
						};
					}
				}
			}

			return {
				autumnProductId: product.id,
				autumnProductName: product.name,
				revenueCatProductIds: existingMapping?.revenuecat_product_ids || [],
				featurePacks,
			};
		});

		setMappings(initialMappings);
		initializedRef.current = true;
	}, [open, products, existingMappings, prepaidInfoByProduct]);

	const handleAddProduct = useCallback(
		(autumnProductId: string, revenueCatProductId: string) => {
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
		},
		[],
	);

	const handleRemoveProduct = useCallback(
		(autumnProductId: string, revenueCatProductId: string) => {
			setMappings((prev) =>
				prev.map((mapping) => {
					if (mapping.autumnProductId !== autumnProductId) return mapping;
					const { [revenueCatProductId]: _removed, ...restPacks } =
						mapping.featurePacks;
					return {
						...mapping,
						revenueCatProductIds: mapping.revenueCatProductIds.filter(
							(id) => id !== revenueCatProductId,
						),
						featurePacks: restPacks,
					};
				}),
			);
		},
		[],
	);

	const handlePacksChange = useCallback(
		(
			autumnProductId: string,
			revenueCatProductId: string,
			featureId: string,
			packs: number | undefined,
		) => {
			// Reject NaN / negatives so we never store an invalid prepaid quantity.
			const safePacks =
				packs === undefined || !Number.isFinite(packs) || packs < 0
					? undefined
					: packs;
			setMappings((prev) =>
				prev.map((mapping) =>
					mapping.autumnProductId === autumnProductId
						? {
								...mapping,
								featurePacks: {
									...mapping.featurePacks,
									[revenueCatProductId]: {
										...(mapping.featurePacks[revenueCatProductId] ?? {}),
										[featureId]: safePacks,
									},
								},
							}
						: mapping,
				),
			);
		},
		[],
	);

	const handleSave = useCallback(async () => {
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
				mappings.map((m) => {
					const prepaidFeatures = prepaidInfoByProduct.get(m.autumnProductId);
					let featureQuantities: RCFeatureQuantities | undefined;
					if (prepaidFeatures && prepaidFeatures.length > 0) {
						featureQuantities = {};
						for (const rcId of m.revenueCatProductIds) {
							const perFeature = prepaidFeatures
								.map((f) => {
									const packs = m.featurePacks[rcId]?.[f.featureId];
									if (packs === undefined) return null;
									return {
										feature_id: f.featureId,
										quantity: getPrepaidDisplayQuantity({
											quantity: packs,
											billingUnits: f.billingUnits,
										}),
									};
								})
								.filter((entry): entry is NonNullable<typeof entry> =>
									Boolean(entry),
								);
							if (perFeature.length > 0) {
								featureQuantities[rcId] = perFeature;
							}
						}
						if (Object.keys(featureQuantities).length === 0) {
							featureQuantities = undefined;
						}
					}

					return {
						autumn_product_id: m.autumnProductId,
						revenuecat_product_ids: m.revenueCatProductIds,
						feature_quantities: featureQuantities,
					};
				}),
			);
			onOpenChange(false);
		} catch (_error) {
			// Error handled by hook
		}
	}, [mappings, saveMappings, onOpenChange, prepaidInfoByProduct]);

	const handleCancel = useCallback(() => {
		onOpenChange(false);
	}, [onOpenChange]);

	// Compute mapped product IDs for each row - memoized per mapping
	const getMappedIdsForProduct = useCallback(
		(excludeAutumnProductId: string) => {
			return mappings
				.filter((m) => m.autumnProductId !== excludeAutumnProductId)
				.flatMap((m) => m.revenueCatProductIds);
		},
		[mappings],
	);

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
						<div className="text-tertiary-foreground text-sm text-center py-8">
							No products found. Create products to map them to RevenueCat.
						</div>
					) : (
						<div className="flex flex-col gap-4">
							{mappings.map((mapping) => {
								const prepaidFeatures = prepaidInfoByProduct.get(
									mapping.autumnProductId,
								);
								const mappedIds = getMappedIdsForProduct(
									mapping.autumnProductId,
								);
								return prepaidFeatures && prepaidFeatures.length > 0 ? (
									<PrepaidMappingRow
										key={mapping.autumnProductId}
										mapping={mapping}
										rcProducts={rcProducts}
										prepaidFeatures={prepaidFeatures}
										mappedRevenueCatProductIds={mappedIds}
										onAddProduct={handleAddProduct}
										onRemoveProduct={handleRemoveProduct}
										onPacksChange={handlePacksChange}
									/>
								) : (
									<MappingRow
										key={mapping.autumnProductId}
										mapping={mapping}
										rcProducts={rcProducts}
										mappedRevenueCatProductIds={mappedIds}
										onAddProduct={handleAddProduct}
										onRemoveProduct={handleRemoveProduct}
									/>
								);
							})}
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
						onClick={handleSave}
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
