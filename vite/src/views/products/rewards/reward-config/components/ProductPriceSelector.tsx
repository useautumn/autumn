import type { ProductItem, ProductV2 } from "@autumn/shared";
import { Checkbox } from "@autumn/ui";
import { PackageIcon, XIcon } from "@phosphor-icons/react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsByPriceIdsQuery } from "@/hooks/queries/useProductsByPriceIdsQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { isFeatureItem } from "@/utils/product/getItemType";
import { formatProductItemText } from "@/utils/product/product-item/formatProductItem";
import type { FrontendReward } from "../../types/frontendReward";

const MAX_VISIBLE_CHIPS = 3;

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

	type Chip = { key: string; label: string; onRemove?: () => void };

	// Collapse a product's prices into a single product chip when all are selected.
	const buildChips = (): Chip[] => {
		if (applyToAll) return [{ key: "__all__", label: "All products" }];

		const chips: Chip[] = [];
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
				<DropdownMenuTrigger className="flex h-8 w-full min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-xl px-3 input-base input-state-open-tiny text-sm">
					{chips.length === 0 ? (
						<span className="text-tertiary-foreground">
							Select plans or apply to all...
						</span>
					) : (
						<>
							{chips.slice(0, MAX_VISIBLE_CHIPS).map((chip) => (
								<span
									className="flex h-4.5 max-w-48 shrink-0 items-center gap-0.5 rounded border border-border bg-accent px-1 text-[10px] text-foreground"
									key={chip.key}
								>
									<span className="shrink-0 [&_svg]:size-3">
										<PackageIcon
											className="text-tertiary-foreground"
											size={12}
											weight="duotone"
										/>
									</span>
									<span className="truncate">{chip.label}</span>
									{chip.onRemove && (
										<span
											className="ml-0.5 cursor-pointer text-tertiary-foreground hover:text-destructive"
											onClick={(e) => {
												e.stopPropagation();
												chip.onRemove?.();
											}}
											onPointerDown={(e) => e.stopPropagation()}
										>
											<XIcon size={10} />
										</span>
									)}
								</span>
							))}
							{chips.length > MAX_VISIBLE_CHIPS && (
								<span className="shrink-0 px-1 text-sm text-tertiary-foreground">
									+{chips.length - MAX_VISIBLE_CHIPS}
								</span>
							)}
						</>
					)}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-64">
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
