import {
	type BillingInterval,
	isPriceItem,
	notNullish,
	type ProductItem,
	ProductItemInterval,
	productV2ToBasePrice,
	productV2ToPlanType,
} from "@autumn/shared";
import { CoinsIcon } from "@phosphor-icons/react";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import { IncludedUsageIcon } from "@/components/v2/icons/AutumnIcons";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";

export const PlanTypeSection = ({
	withSeparator = true,
}: {
	withSeparator?: boolean;
}) => {
	const { product, setProduct } = useProduct();

	const planType = productV2ToPlanType({ product });

	// if (!product.items) return null;

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
				item.price === basePrice?.price && isPriceItem(item),
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
		amount = "",
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
						: basePrice?.price;

			newItems[basePriceIndex] = {
				...newItems[basePriceIndex],
				price: newAmount as number,
				interval: interval as unknown as ProductItemInterval,
				// 	? billingToItemInterval({ billingInterval: interval })
				// 	: basePrice?.interval,
				interval_count: interval ? intervalCount : basePrice?.interval_count,
			};
		} else {
			newItems.push({
				price: Number.parseFloat(amount ?? "") as number,
				interval: interval as unknown as ProductItemInterval,
				interval_count: intervalCount,
			});
		}

		setProduct({
			...product,
			items: newItems,
		});
	};

	return (
		<SheetSection title="Select Plan Type">
			<div className="space-y-4">
				<div className="mt-3 space-y-4">
					<div className="flex w-full items-center gap-4">
						<PanelButton
							isSelected={planType === "free"}
							onClick={() => {
								// handleDeleteBasePrice();
								setProduct({
									...product,
									planType: "free",
									is_default: !product.is_add_on,
									basePriceType: null,
									items:
										product.items?.filter(
											(item: ProductItem) => !isPriceItem(item),
										) ?? [],
								});
							}}
							icon={<IncludedUsageIcon size={16} color="currentColor" />}
						/>
						<div className="flex-1">
							<div className="text-body-highlight mb-1 flex-row flex items-center gap-1">
								Free
								{/* <InfoIcon size={8} weight="regular" color="#888888" /> */}
							</div>
							<div className="text-body-secondary leading-tight">
								A plan without pricing that customers can use for free
							</div>
						</div>
					</div>

					<div className="flex w-full items-center gap-4">
						<PanelButton
							isSelected={planType === "paid"}
							onClick={async () => {
								// await handleDeleteBasePrice();
								setProduct({
									...product,
									planType: "paid",
									basePriceType: "recurring",
									is_default: false,
									items: [
										...product.items,
										{
											price: "" as unknown as number,
											interval: ProductItemInterval.Month,
											interval_count: 1,
										},
									],
								});
								// handleUpdateBasePrice({
								// 	amount: "",
								// 	interval:
								// 		ProductItemInterval.Month as unknown as BillingInterval,
								// 	intervalCount: 1,
								// });
								// console.log("hey");

								// console.log(product);
								// await setProduct({
								// 	...product,
								// 	items: [
								// 		...product.items,
								// 		{
								// 			price: 10,
								// 			interval: ProductItemInterval.Month,
								// 		},
								// 	],
								// });
							}}
							icon={<CoinsIcon size={16} color="currentColor" />}
						/>
						<div className="flex-1">
							<div className="text-body-highlight mb-1 flex-row flex items-center gap-1">
								Paid
								{/* <InfoIcon size={8} weight="regular" color="#888888" /> */}
							</div>
							<div className="text-body-secondary leading-tight">
								A plan with fixed or usage-based pricing that customers may
								purchase
							</div>
						</div>
					</div>
				</div>
			</div>
		</SheetSection>
	);
};
