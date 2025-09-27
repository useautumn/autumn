import {
	BillingInterval,
	billingToItemInterval,
	isPriceItem,
	notNullish,
	nullish,
	type ProductItem,
	productV2ToBasePrice,
} from "@autumn/shared";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useProductContext } from "@/views/products/product/ProductContext";
import { SelectBillingCycle } from "./SelectBillingCycle";

export const BasePriceSection = () => {
	const { product, setProduct } = useProductContext();

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
		const basePriceIndex = newItems.findIndex(
			(item: ProductItem) => item.price === basePrice?.amount,
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
				price: newAmount,
				interval: interval
					? billingToItemInterval({ billingInterval: interval })
					: basePrice?.interval,
				interval_count: interval ? intervalCount : basePrice?.intervalCount,
				isBasePrice: true,
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
			checked={!disabled}
			setChecked={(checked) => {
				if (checked) {
					setProduct({
						...product,
						items: [
							...product.items,
							{
								price: 10,
								interval: BillingInterval.Month,
							},
						],
					});
				} else {
					handleDeleteBasePrice();
				}
			}}
			description="Fixed recurring price (e.g., $100/month). Leave unchecked for free or usage-based only plans."
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
