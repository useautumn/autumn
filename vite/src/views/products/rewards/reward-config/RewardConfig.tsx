import { type ProductV2, type Reward, RewardType } from "@autumn/shared";
import { useEffect, useState } from "react";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { keyToTitle, slugify } from "@/utils/formatUtils/formatTextUtils";
import { notNullish } from "@/utils/genUtils";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { isFreeProduct, isOneOffProduct } from "@/utils/product/priceUtils";
import { defaultDiscountConfig } from "../utils/defaultRewardModels";
import { DiscountConfig } from "./DiscountConfig";
import { FreeDurationSelect } from "./FreeDurationSelect";

export const RewardConfig = ({
	reward,
	setReward,
}: {
	reward: Reward;
	setReward: (reward: Reward) => void;
}) => {
	const [idChanged, setIdChanged] = useState(false);
	const { products } = useProductsQuery();

	useEffect(() => {
		if (!idChanged) {
			setReward({
				...reward,
				id: slugify(reward.name || ""),
			});
		}
	}, [reward, idChanged, setReward]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2">
				<div className="w-6/12">
					<FieldLabel description="Will be shown on receipt">Name</FieldLabel>
					<Input
						value={reward.name || ""}
						onChange={(e) => setReward({ ...reward, name: e.target.value })}
					/>
				</div>
				<div className="w-6/12">
					<FieldLabel description="Used to identify reward in API">
						ID
					</FieldLabel>
					<Input
						value={reward.id || ""}
						onChange={(e) => {
							setReward({ ...reward, id: e.target.value });
							setIdChanged(true);
						}}
					/>
				</div>
			</div>
			<div className="flex items-center w-full gap-2">
				<div className="w-full">
					<FieldLabel>Promotional Code</FieldLabel>
					<Input
						value={
							reward.promo_codes.length > 0 ? reward.promo_codes[0].code : ""
						}
						onChange={(e) =>
							setReward({
								...reward,
								promo_codes: [{ code: e.target.value }],
							})
						}
					/>
				</div>
				<div className="w-full">
					<FieldLabel>Type</FieldLabel>
					<Select
						value={reward.type}
						onValueChange={(value) => {
							setReward({
								...reward,
								type: value as RewardType,
								discount_config:
									value === RewardType.FreeProduct
										? null
										: defaultDiscountConfig,
							});
						}}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select a discount type" />
						</SelectTrigger>
						<SelectContent>
							{Object.values(RewardType).map((type) => (
								<SelectItem key={type} value={type}>
									{keyToTitle(type)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			{reward.type === RewardType.FreeProduct ? (
				<div>
					<div>
					<FieldLabel description="Select a product to give away" tooltip="If the referrer/redeemer already has the product, it will not be added to them.">
						Product
					</FieldLabel>
					</div>
					<Select
						value={reward.free_product_id || undefined}
						onValueChange={(value) =>
							setReward({ ...reward, free_product_id: value })
						}
					>
						{(() => {
							const filteredProducts = [
								// Paid products, no feature prices
								...products
									.filter((product: ProductV2) => !isFreeProduct(product.items))
									.filter(
										(product: ProductV2) =>
											!product.items.some((x) => isFeaturePriceItem(x)),
									),
								// Free add-ons
								...products
									.filter((product: ProductV2) => product.is_add_on)
									.filter((product: ProductV2) => isFreeProduct(product.items)),
							];

							const empty = filteredProducts.length === 0;
							return (
								<>
									<SelectTrigger disabled={empty}>
										<SelectValue
											placeholder={
												empty
													? "Create a free add-on or paid product first"
													: "Select a product"
											}
										/>
									</SelectTrigger>
									<SelectContent>
										{filteredProducts.map((product: ProductV2) => (
											<SelectItem key={product.id} value={product.id}>
												{product.name}
											</SelectItem>
										))}
									</SelectContent>
								</>
							);
						})()}
					</Select>
				</div>
			) : notNullish(reward.type) ? (
				<DiscountConfig reward={reward} setReward={setReward} />
			) : null}

			{reward.type === RewardType.FreeProduct &&
			notNullish(reward.free_product_id) &&
			reward.free_product_id &&
			!isOneOffProduct(
				products.find(
					(product: ProductV2) => product.id === reward.free_product_id,
				)?.items || [],
			) ? (
				<FreeDurationSelect reward={reward} setReward={setReward} />
			) : null}
		</div>
	);
};
