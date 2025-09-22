import { PriceItem } from "@/components/pricing/attach-pricing-dialog";
import { useOrg } from "@/hooks/common/useOrg";
import { formatAmount } from "@/utils/product/productItemUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { AttachBranch } from "@autumn/shared";

export const OptionsResult = () => {
	const { org } = useOrg();
	const { attachState, product } = useProductContext();
	const { preview, options } = attachState;
	const currency = org?.default_currency || "USD";

	const dueToday = preview.due_today;
	if (!dueToday || preview.branch == AttachBranch.NewVersion) {
		return null;
	}

	const getDifference = (option: any) => {
		const {
			current_quantity: currentQuantity,
			quantity: newQuantity,
			price,
			billing_units,
			feature_name,
		} = option;
		const difference = (newQuantity || 0) - currentQuantity;
		const priceForDifference = difference * (price / billing_units);

		let title = "";
		if (!currentQuantity) {
			title = ` ${difference} ${feature_name}`;
		} else if (difference > 0) {
			title += ` Additional ${difference} ${feature_name}`;
		} else if (difference < 0) {
			title += ` Less ${-difference} ${feature_name}`;
		} else {
			title = ` ${Math.abs(difference)} ${feature_name}`;
		}

		return {
			difference,
			amount: priceForDifference,
			title: `${product.name} - ${title}`,
		};
	};

	return (
		<>
			{options && options.length > 0 && (
				<>
					{options.map((option: any, index: number) => {
						// Calculate price for option
						const { feature_name, billing_units, quantity, price } = option;

						const proratedAmount = option.proration_amount;
						const currentQuantity = option.current_quantity;
						const { title, difference, amount } = getDifference(option);

						return (
							<>
								{proratedAmount > 0 && (
									<PriceItem key={feature_name}>
										<span>
											{product.name} - {currentQuantity} {feature_name}{" "}
											(Prorated)
										</span>
										<div className="flex items-center gap-2 ">
											<span className="text-muted-foreground truncate max-w-40">
												{formatAmount({
													defaultCurrency: currency,
													amount: proratedAmount,
													maxFractionDigits: 2,
												})}{" "}
											</span>
										</div>
									</PriceItem>
								)}
								<PriceItem key={feature_name}>
									<span>{title}</span>
									<span className="text-muted-foreground truncate max-w-40">
										{formatAmount({
											defaultCurrency: currency,
											amount: amount,
											maxFractionDigits: 2,
										})}
									</span>
								</PriceItem>
							</>
						);
					})}
				</>
			)}
		</>
	);
};
