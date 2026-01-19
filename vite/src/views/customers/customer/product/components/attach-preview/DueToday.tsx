import {
	AttachBranch,
	formatAmount,
	getAmountForQuantity,
	type Price,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { PriceItem } from "@/components/pricing/attach-pricing-dialog";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/hooks/common/useOrg";
import { notNullish } from "@/utils/genUtils";
import { useProductContext } from "@/views/products/product/ProductContext";

export const DueToday = () => {
	const { org } = useOrg();
	const { attachState, product } = useProductContext();
	const { preview, options, setOptions } = attachState;

	const dueToday = preview.due_today;

	if (!dueToday || preview.branch == AttachBranch.NewVersion) {
		return null;
	}

	const dueTodayItems = dueToday.line_items;
	const currency = org?.default_currency || "USD";
	const branch = preview.branch;

	const getTotalPrice = () => {
		let total =
			preview?.due_today?.line_items.reduce((acc: any, item: any) => {
				if (item.amount) {
					return acc.plus(item.amount);
				}
				return acc;
			}, new Decimal(0)) || new Decimal(0);
		total = total.toNumber();

		options.forEach((option: any) => {
			// Get invoice amount

			if (option.tiers) {
				const amount = getAmountForQuantity({
					price: {
						config: {
							usage_tiers: option.tiers,
							billing_units: option.billing_units,
						},
					} as Price,
					quantity: option.quantity || 0,
				});

				total = new Decimal(total).plus(amount).toNumber();
			}

			if (notNullish(option.price)) {
				total = new Decimal(total)
					.plus(
						new Decimal(option.price).times(
							new Decimal(option.quantity || 0).div(option.billing_units),
						),
					)
					.toNumber();
			}
		});
		return total;
	};

	const getTitle = () => {
		if (branch == AttachBranch.UpdatePrepaidQuantity) {
			return "Update quantity";
		}

		return "Due today";
	};

	const getPrepaidPrice = ({ option }: { option: any }) => {
		if (notNullish(option.price)) {
			return `x ${formatAmount({
				amount: option.price,
				currency,
				maxFractionDigits: 5,
			})} per `;
		}

		if (option.tiers) {
			const start = option.tiers[0].amount;
			const end = option.tiers[option.tiers.length - 1].amount;
			return "x ";
			// return `${formatAmount({
			//   amount: start,
			//   defaultCurrency: currency,
			//   maxFractionDigits: 5,
			// })} - ${formatAmount({
			//   amount: end,
			//   defaultCurrency: currency,
			//   maxFractionDigits: 5,
			// })} `;
		}

		return "";
	};

	return (
		<div className="flex flex-col">
			<p className="text-t2 font-semibold mb-2">{getTitle()}</p>
			{dueTodayItems &&
				dueTodayItems.map((item: any) => {
					const { description, price } = item;
					return (
						<PriceItem key={description}>
							<span>{description}</span>
							<span className="max-w-60 overflow-hidden truncate">{price}</span>
						</PriceItem>
					);
				})}
			{/* <AttachNewItems /> */}
			{options.length > 0 &&
				options.map((option: any, index: number) => {
					const { feature_name, billing_units, quantity, price } = option;
					return (
						<PriceItem key={feature_name}>
							<span className="max-w-60 overflow-hidden truncate">
								{product.name} - {feature_name}
							</span>
							<div className="flex items-center gap-2 ">
								<Input
									type="number"
									value={notNullish(quantity) ? quantity / billing_units : ""}
									onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
										const newOptions = [...options];
										newOptions[index].quantity =
											parseInt(e.target.value) * billing_units;

										setOptions(newOptions);
									}}
									className="w-12 h-7"
								/>

								<span className="text-muted-foreground truncate max-w-40">
									{/* ×{" "} */}
									{/* {formatAmount({
                    defaultCurrency: currency,
                    amount: price,
                    maxFractionDigits: 2,
                  })}{" "} */}
									{getPrepaidPrice({ option })}
									{billing_units === 1 ? " " : billing_units} {feature_name}
								</span>
							</div>
						</PriceItem>
					);
				})}
			{preview.due_today && (
				<PriceItem className="font-bold mt-2">
					<span>Total:</span>
					<span>
						{formatAmount({
							amount: getTotalPrice(),
							currency,
							maxFractionDigits: 2,
						})}
					</span>
				</PriceItem>
			)}
		</div>
	);
};
