import type { ProductItem } from "@autumn/shared";
import { Check, X } from "@phosphor-icons/react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	SelectGroup,
	SelectLabel,
} from "@/components/v2/selects/Select";
import { TagSelect } from "@/components/v2/selects/TagSelect";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { isFeatureItem } from "@/utils/product/getItemType";
import { formatProductItemText } from "@/utils/product/product-item/formatProductItem";
import type { FrontendReward } from "../../types/frontendReward";

interface ProductPriceSelectorProps {
	reward: FrontendReward;
	setReward: (reward: FrontendReward) => void;
}

export function ProductPriceSelector({
	reward,
	setReward,
}: ProductPriceSelectorProps) {
	const { org } = useOrg();
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();

	const config = reward.discount_config!;

	const setConfig = (key: string, value: any) => {
		setReward({
			...reward,
			discount_config: { ...config, [key]: value },
		});
	};

	const handlePriceToggle = (priceId: string) => {
		const currentPriceIds = config.price_ids || [];
		let newPriceIds: string[];

		if (currentPriceIds.includes(priceId)) {
			newPriceIds = currentPriceIds.filter((id) => id !== priceId);
		} else {
			newPriceIds = [...currentPriceIds, priceId];
		}

		// If selecting a specific price, clear apply_to_all
		setReward({
			...reward,
			discount_config: {
				...config,
				apply_to_all: false,
				price_ids: newPriceIds,
			},
		});
	};

	const handleApplyToAllToggle = () => {
		const newApplyToAll = !config.apply_to_all;

		if (newApplyToAll) {
			// Enabling "Apply to all" clears price_ids
			setReward({
				...reward,
				discount_config: {
					...config,
					apply_to_all: true,
					price_ids: [],
				},
			});
		} else {
			// Disabling "Apply to all" just sets it to false
			setConfig("apply_to_all", false);
		}
	};

	const formatPriceTag = (priceId: string) => {
		const item = products
			.find((p: any) => p.items.find((i: any) => i.price_id === priceId))
			?.items.find((i: any) => i.price_id === priceId);

		return item
			? formatProductItemText({
					item,
					org,
					features,
				})
			: "Unknown Price";
	};

	// Get products with non-feature items
	const availableProducts = products.filter((product: any) => {
		const nonFeatureItems = product.items?.filter(
			(item: ProductItem) => !isFeatureItem(item),
		);
		return nonFeatureItems && nonFeatureItems.length > 0;
	});

	if (!products || products.length === 0) {
		return <p className="text-sm text-t3">No products available</p>;
	}

	// Build options list - not used for display, just for reference
	const priceOptions = availableProducts.flatMap((product: any) => {
		const nonFeatureItems = product.items.filter(
			(item: ProductItem) => !isFeatureItem(item),
		);
		return nonFeatureItems.map((item: any) => ({
			value: item.price_id,
			label: formatProductItemText({ item, org, features }),
		}));
	});

	return (
		<TagSelect
			value={config.price_ids || []}
			onChange={(values) => setConfig("price_ids", values)}
			options={priceOptions}
			placeholder="Select plans or apply to all"
			formatTag={formatPriceTag}
			showAllProducts={config.apply_to_all}
			renderContent={(setOpen) => (
				<>
					{/* Apply to all option */}
					<SelectGroup>
						<div
							role="button"
							tabIndex={0}
							className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 cursor-pointer"
							onClick={() => {
								handleApplyToAllToggle();
								setOpen(false);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									handleApplyToAllToggle();
									setOpen(false);
								}
							}}
						>
							<div className="flex items-center justify-between w-full">
								<span>Apply to all products</span>
								{config.apply_to_all && (
									<Check size={14} className="text-primary ml-2" />
								)}
							</div>
						</div>
					</SelectGroup>

					{/* Product groups */}
					{availableProducts.map((product: any) => {
						const nonFeatureItems = product.items.filter(
							(item: ProductItem) => !isFeatureItem(item),
						);

						return (
							<SelectGroup key={product.id}>
								<SelectLabel>{product.name}</SelectLabel>
								{nonFeatureItems.map((item: any) => {
									const isSelected = config.price_ids?.includes(item.price_id);
									return (
										<div
											key={item.price_id}
											role="button"
											tabIndex={0}
											className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 cursor-pointer"
											onClick={() => handlePriceToggle(item.price_id)}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault();
													handlePriceToggle(item.price_id);
												}
											}}
										>
											<div className="flex items-center justify-between w-full">
												<span className="truncate">
													{formatProductItemText({
														item,
														org,
														features,
													})}
												</span>
												{isSelected && (
													<Check size={14} className="text-primary ml-2" />
												)}
											</div>
										</div>
									);
								})}
							</SelectGroup>
						);
					})}
				</>
			)}
		/>
	);
}
