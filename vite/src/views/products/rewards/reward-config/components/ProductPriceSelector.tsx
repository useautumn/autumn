import type { ProductItem, ProductV2 } from "@autumn/shared";
import {
	Checkbox,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@autumn/ui";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsByPriceIdsQuery } from "@/hooks/queries/useProductsByPriceIdsQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { isFeatureItem } from "@/utils/product/getItemType";
import { formatProductItemText } from "@/utils/product/product-item/formatProductItem";
import {
	ChipSelectTrigger,
	type SelectorChip,
} from "../../components/ChipSelectTrigger";
import type { FrontendReward } from "../../types/frontendReward";

interface ProductPriceSelectorProps {
	reward: FrontendReward;
	setReward: (reward: FrontendReward) => void;
}

const priceItemsOf = (product: ProductV2) =>
	(product.items ?? []).filter(
		(item): item is ProductItem & { price_id: string } =>
			!isFeatureItem(item) && Boolean(item.price_id),
	);

export function ProductPriceSelector({
	reward,
	setReward,
}: ProductPriceSelectorProps) {
	const { org } = useOrg();
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();

	const config = reward.discount_config!;
	const priceIds = config.price_ids ?? [];
	const applyToAll = config.apply_to_all ?? false;

	// Selected price IDs may belong to historical versions absent from the
	// latest-versions list; resolve their owning product for chip labels.
	const { products: linkedProductVersions, isLoading: linkedVersionsLoading } =
		useProductsByPriceIdsQuery(priceIds);

	const setPriceIds = (nextPriceIds: string[]) =>
		setReward({
			...reward,
			discount_config: {
				...config,
				apply_to_all: false,
				price_ids: nextPriceIds,
			},
		});

	const toggleApplyToAll = () =>
		setReward({
			...reward,
			discount_config: {
				...config,
				apply_to_all: !applyToAll,
				price_ids: [],
			},
		});

	const togglePrice = (priceId: string) =>
		setPriceIds(
			priceIds.includes(priceId)
				? priceIds.filter((id) => id !== priceId)
				: [...priceIds, priceId],
		);

	const toggleProduct = (product: ProductV2) => {
		const ids = priceItemsOf(product).map((item) => item.price_id);
		const allSelected = ids.every((id) => priceIds.includes(id));
		setPriceIds(
			allSelected
				? priceIds.filter((id) => !ids.includes(id))
				: [...priceIds, ...ids.filter((id) => !priceIds.includes(id))],
		);
	};

	const availableProducts = products.filter(
		(product) => priceItemsOf(product).length > 0,
	);

	// Prefer latest versions already on the client; fall back to the async
	// query only for prices owned by historical versions.
	const productVersionOf = (priceId: string) =>
		[...products, ...linkedProductVersions].find((product) =>
			product.items?.some((item) => item.price_id === priceId),
		);

	const chipLabel = (priceId: string) => {
		const product = productVersionOf(priceId);
		const item = product?.items?.find((i) => i.price_id === priceId);
		if (!item || !product)
			return linkedVersionsLoading ? "Loading…" : "Unknown price";
		const priceText = formatProductItemText({ item, org, features });
		return `${product.name} v${product.version} — ${priceText}`;
	};

	// Collapse a product's prices into a single product chip when all are selected.
	const buildChips = (): SelectorChip[] => {
		if (applyToAll) return [{ key: "__all__", label: "All products" }];

		const chips: SelectorChip[] = [];
		const seenProducts = new Set<string>();
		for (const priceId of priceIds) {
			const product = productVersionOf(priceId);
			const productPriceIds = product
				? priceItemsOf(product).map((item) => item.price_id)
				: [];
			const allPricesSelected =
				productPriceIds.length > 0 &&
				productPriceIds.every((id) => priceIds.includes(id));

			if (product && allPricesSelected) {
				const productKey = `${product.id}:${product.version}`;
				if (seenProducts.has(productKey)) continue;
				seenProducts.add(productKey);
				chips.push({
					key: productKey,
					label: product.name,
					onRemove: () =>
						setPriceIds(priceIds.filter((id) => !productPriceIds.includes(id))),
				});
				continue;
			}

			chips.push({
				key: priceId,
				label: chipLabel(priceId),
				onRemove: () => togglePrice(priceId),
			});
		}
		return chips;
	};

	if (!products || products.length === 0)
		return (
			<p className="text-sm text-tertiary-foreground">No products available</p>
		);

	const chips = buildChips();

	return (
		<div className="min-w-0 w-full">
			<DropdownMenu>
				<ChipSelectTrigger
					chips={chips}
					placeholder="Select plans or apply to all..."
				/>
				<DropdownMenuContent align="start" className="w-[var(--anchor-width)]">
					<DropdownMenuItem
						className="flex cursor-pointer items-center gap-2 font-medium"
						closeOnClick={false}
						onClick={(e) => {
							e.preventDefault();
							toggleApplyToAll();
						}}
					>
						<Checkbox checked={applyToAll} className="border-border" />
						<span className="truncate">Apply to all products</span>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<div className="max-h-72 overflow-y-auto">
						{availableProducts.map((product) => {
							const priceItems = priceItemsOf(product);

							if (priceItems.length === 1) {
								const priceId = priceItems[0].price_id;
								return (
									<DropdownMenuItem
										className="flex cursor-pointer items-center gap-2 font-medium"
										closeOnClick={false}
										key={product.id}
										onClick={(e) => {
											e.preventDefault();
											togglePrice(priceId);
										}}
									>
										<Checkbox
											checked={!applyToAll && priceIds.includes(priceId)}
											className="border-border"
										/>
										<span className="truncate">{product.name}</span>
									</DropdownMenuItem>
								);
							}

							const ids = priceItems.map((item) => item.price_id);
							const selectedCount = ids.filter((id) =>
								priceIds.includes(id),
							).length;
							const allSelected = !applyToAll && selectedCount === ids.length;
							const someSelected = !applyToAll && selectedCount > 0;

							return (
								<DropdownMenuSub key={product.id}>
									<DropdownMenuSubTrigger
										className="flex cursor-pointer items-center gap-2 font-medium"
										onClick={(e) => {
											e.preventDefault();
											toggleProduct(product);
										}}
									>
										<Checkbox
											checked={allSelected}
											indeterminate={someSelected && !allSelected}
											className="border-border"
										/>
										<span className="truncate">{product.name}</span>
									</DropdownMenuSubTrigger>
									<DropdownMenuSubContent>
										<DropdownMenuItem
											className="flex cursor-pointer items-center gap-2 font-medium"
											closeOnClick={false}
											onClick={(e) => {
												e.preventDefault();
												toggleProduct(product);
											}}
										>
											<Checkbox
												checked={allSelected}
												indeterminate={someSelected && !allSelected}
												className="border-border"
											/>
											All prices
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										{priceItems.map((item) => (
											<DropdownMenuItem
												className="flex cursor-pointer items-center gap-2 text-sm"
												closeOnClick={false}
												key={item.price_id}
												onClick={(e) => {
													e.preventDefault();
													togglePrice(item.price_id);
												}}
											>
												<Checkbox
													checked={
														!applyToAll && priceIds.includes(item.price_id)
													}
													className="border-border"
												/>
												<span className="truncate">
													{formatProductItemText({ item, org, features })}
												</span>
											</DropdownMenuItem>
										))}
									</DropdownMenuSubContent>
								</DropdownMenuSub>
							);
						})}
					</div>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
