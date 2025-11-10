import {
	type BillingInterval,
	isPriceItem,
	notNullish,
	nullish,
	type ProductItem,
	ProductItemInterval,
	productV2ToBasePrice,
} from "@autumn/shared";
import { CoinsIcon, InfoIcon } from "@phosphor-icons/react";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useProductStore } from "@/hooks/stores/useProductStore";

export const PriceTypeSection = ({
	withSeparator = true,
}: {
	withSeparator?: boolean;
}) => {
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);

	if (!product.items) return null;

	const basePrice = productV2ToBasePrice({ product });

	const handleDeleteBasePrice = () => {
		setProduct({
			...product,
			items: product.items.filter((item: ProductItem) => !isPriceItem(item)),
		});
	};

	const getBasePriceIndex = () => {
		return product.items.findIndex(
			(item: ProductItem) =>
				item.price === basePrice?.amount && isPriceItem(item),
		);
	};

	const setItem = (item: ProductItem) => {
		const newItems = [...product.items];
		newItems[getBasePriceIndex()] = item;
		setProduct({
			...product,
			items: newItems,
		});
	};

	const handleUpdateBasePrice = ({
		amount,
		interval,
		intervalCount,
	}: {
		amount?: string;
		interval?: BillingInterval;
		intervalCount?: number;
	}) => {
		const newItems = [...product.items];

		// Find base price item by isBasePrice flag, not by price match
		const basePriceIndex = newItems.findIndex((item: ProductItem) =>
			isPriceItem(item),
		);

		if (basePriceIndex !== -1) {
			const newAmount =
				amount === ""
					? amount
					: notNullish(amount)
						? Number.parseFloat(amount ?? "")
						: basePrice?.amount;

			newItems[basePriceIndex] = {
				...newItems[basePriceIndex],
				price: newAmount as number,
				// interval: interval
				// 	? billingToItemInterval({ billingInterval: interval })
				// 	: basePrice?.interval,
				interval_count: interval ? intervalCount : basePrice?.intervalCount,
			};
		}

		setProduct({
			...product,
			items: newItems,
		});
	};

	const disabled = nullish(basePrice);

	return (
		<SheetSection title="Select Plan Type">
			<div className="space-y-4">
				<div className="mt-3 space-y-4">
					<div className="flex w-full items-center gap-4">
						<PanelButton
							isSelected={!disabled}
							onClick={() => {
								if (disabled) {
									setProduct({
										...product,
										items: [
											...product.items,
											{
												price: 10,
												interval: ProductItemInterval.Month,
											},
										],
									});
								} else {
									handleDeleteBasePrice();
								}
							}}
							icon={<CoinsIcon size={16} color="currentColor" />}
						/>
						<div className="flex-1">
							<div className="text-body-highlight mb-1 flex-row flex items-center gap-1">
								Free
								<InfoIcon size={8} weight="regular" color="#888888" />
							</div>
							<div className="text-body-secondary leading-tight">
								A usage-based feature that you want to track
							</div>
						</div>
					</div>
					{/* 
					<div className="flex w-full items-center gap-4">
						<PanelButton
							isSelected={feature.type === APIFeatureType.Boolean}
							onClick={() => {
								setFeature({ ...feature, type: APIFeatureType.Boolean });
							}}
							icon={<BooleanIcon />}
						/>
						<div className="flex-1">
							<div className="text-body-highlight mb-1 flex-row flex items-center gap-1">
								Boolean
								<InfoIcon size={8} weight="regular" color="#888888" />
							</div>
							<div className="text-body-secondary leading-tight">
								A flag that can either be enabled or disabled.
							</div>
						</div>
					</div> */}
				</div>
			</div>
		</SheetSection>
	);
};
