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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { itemToBillingInterval } from "@/utils/product/itemIntervalUtils";
import { useProductContext } from "@/views/products/product/ProductContext";

export const BasePriceSection = () => {
	const { product, setProduct } = useProductContext();

	const basePrice = productV2ToBasePrice({ product });

	const handleDeleteBasePrice = () => {
		setProduct({
			...product,
			items: product.items.filter((item: ProductItem) => !isPriceItem(item)),
		});
	};

	const handleUpdateBasePrice = ({
		amount,
		interval,
	}: {
		amount?: string;
		interval?: BillingInterval;
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
					? billingToItemInterval(interval)
					: basePrice?.interval,

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
						<FormLabel disabled={disabled}>Interval</FormLabel>
						<Select
							disabled={disabled}
							value={
								itemToBillingInterval({
									interval: basePrice?.interval,
								}) as string
							}
							onValueChange={(value) => {
								handleUpdateBasePrice({
									interval: value as BillingInterval,
								});
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select interval" />
							</SelectTrigger>
							<SelectContent>
								{Object.values(BillingInterval).map((interval) => (
									<SelectItem key={interval} value={interval}>
										{keyToTitle(interval)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			</div>
		</SheetSection>
	);
};
