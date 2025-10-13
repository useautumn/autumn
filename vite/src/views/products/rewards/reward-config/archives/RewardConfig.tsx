import {
	type ProductV2,
	type Reward,
	RewardType,
	UsageModel,
} from "@autumn/shared";
import { useEffect, useState } from "react";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { WarningBox } from "@/components/general/modal-components/WarningBox";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	formatAmount as formatCurrency,
	keyToTitle,
	slugify,
} from "@/utils/formatUtils/formatTextUtils";
import { notNullish } from "@/utils/genUtils";
import { isFeaturePriceItem, isPriceItem } from "@/utils/product/getItemType";
import { isFreeProduct, isOneOffProduct } from "@/utils/product/priceUtils";
import { defaultDiscountConfig } from "../utils/defaultRewardModels";
import { DiscountConfig } from "./DiscountConfig";

export const RewardConfig = ({
	reward,
	setReward,
}: {
	reward: Reward;
	setReward: (reward: Reward) => void;
}) => {
	const [idChanged, setIdChanged] = useState(false);
	const { products } = useProductsQuery();
	const { org } = useOrg();

	useEffect(() => {
		if (!idChanged) {
			setReward({
				...reward,
				id: slugify(reward.name || ""),
			});
		}
	}, [idChanged, reward, setReward]);

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
					<FieldLabel description="Select a free add-on product to give away">
						Product
					</FieldLabel>
					<Select
						value={reward.free_product_id || undefined}
						onValueChange={(value) =>
							setReward({ ...reward, free_product_id: value })
						}
					>
						{(() => {
							const freeAddOns = products
								.filter((product: ProductV2) => product.is_add_on)
								.filter((product: ProductV2) => isFreeProduct(product.items));

							const empty = freeAddOns.length === 0;
							return (
								<>
									<SelectTrigger disabled={empty}>
										<SelectValue
											placeholder={
												empty
													? "Create a free add-on product first"
													: "Select a product"
											}
										/>
									</SelectTrigger>
									<SelectContent>
										{freeAddOns.map((product: ProductV2) => (
											<SelectItem key={product.id} value={product.id}>
												{product.name}
											</SelectItem>
										))}
									</SelectContent>
								</>
							);
						})()}
					</Select>

					{(() => {
						const selectedProduct = products.find(
							(p: ProductV2) => p.id === reward.free_product_id,
						);

						if (!selectedProduct) return null;

						const isPaidSelected = !isFreeProduct(selectedProduct.items);
						if (!isPaidSelected) return null;

						const isRecurringSelected = !isOneOffProduct(selectedProduct.items);
						const hasUsagePrices = selectedProduct.items.some(
							(x) =>
								isFeaturePriceItem(x) && x.usage_model === UsageModel.PayPerUse,
						);

						const priceItem = selectedProduct.items.find((x) => isPriceItem(x));
						const currency = org?.default_currency || "USD";
						const fixedAmountStr = priceItem?.price
							? formatCurrency({ amount: priceItem.price, currency })
							: undefined;

						if (isRecurringSelected) {
							return (
								<div className="mt-3">
									<WarningBox>
										If the receiver is already on a product, they will receive a
										coupon equal to this product's fixed price amount (
										{fixedAmountStr}).{" "}
										{hasUsagePrices
											? "Charges due to usage prices will not be included in the coupon."
											: ""}
									</WarningBox>
								</div>
							);
						}

						return;
					})()}
				</div>
			) : notNullish(reward.type) ? (
				<DiscountConfig reward={reward} setReward={setReward} />
			) : null}
		</div>
	);
};
