import { PriceItem } from "@/components/pricing/attach-pricing-dialog";
import { Input } from "@/components/ui/input";
import { notNullish } from "@/utils/genUtils";
import { useProductContext } from "@/views/products/product/ProductContext";

export const OptionsInput = () => {
	const { attachState, product } = useProductContext();
	const { options, setOptions } = attachState;

	if (!options || options.length == 0) return null;

	return (
		<div className="flex flex-col">
			{options.length > 0 &&
				options.map((option: any, index: number) => {
					const { feature_name, billing_units, quantity, price } = option;
					return (
						<PriceItem key={feature_name}>
							<span>
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

								{/* <span className="text-muted-foreground truncate max-w-40">
                  ×{" "}
                  {formatAmount({
                    defaultCurrency: currency,
                    amount: price,
                    maxFractionDigits: 2,
                  })}{" "}
                  per {billing_units === 1 ? " " : billing_units} {feature_name}
                </span> */}
							</div>
						</PriceItem>
					);
				})}
		</div>
	);
};
