import {
	type BillingInterval,
	isPriceItem,
	notNullish,
	nullish,
	type ProductItem,
	ProductItemInterval,
	productV2ToBasePrice,
} from "@autumn/shared";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { SelectBillingCycle } from "./SelectBillingCycle";

export const BasePriceSection = ({
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
		<SheetSection
			title="Base Price"
			withSeparator={withSeparator}
			checked={!disabled}
			setChecked={(checked) => {
				if (checked) {
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
			description={
				<span>
					Fixed recurring price (e.g., $100/month). Uncheck this section for{" "}
					<span className="text-primary font-bold">free</span> or{" "}
					<span className="text-primary font-bold">usage-based only</span>{" "}
					plans.
				</span>
			}
		>
			<div className="space-y-4">
				<div className="grid grid-cols-2 gap-2">
					<div>
						<FormLabel disabled={disabled}>Price</FormLabel>
						<Input
							type="number"
							placeholder="eg. $100"
							disabled={disabled}
							value={basePrice?.amount ?? ""}
							onChange={(e) => {
								if (Number(e.target.value) >= 0)
									handleUpdateBasePrice({
										amount: e.target.value,
									});
							}}
						/>
					</div>
					<div>
						<SelectBillingCycle
							item={basePrice?.item}
							setItem={setItem}
							disabled={disabled}
						/>
					</div>
				</div>
			</div>
		</SheetSection>
	);
};
