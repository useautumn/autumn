import { nullish, ProductItemInterval, UsageModel } from "@autumn/shared";
import { InfoIcon } from "@phosphor-icons/react";
import { useId } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function PricedFeatureSettings() {
	const { item, setItem } = useProductItemContext();
	const payPerUseId = useId();
	const prepaidId = useId();

	if (!item) return null;

	const handleUsageModelChange = (value: string) => {
		const usageModel = value as UsageModel;
		setItem({
			...item,
			usage_model: usageModel,
			interval:
				usageModel === UsageModel.PayPerUse && nullish(item.interval)
					? ProductItemInterval.Month
					: item.interval,
		});
	};

	return (
		<div className="mt-6">
			<RadioGroup
				value={item.usage_model}
				onValueChange={handleUsageModelChange}
				className="space-y-4"
			>
				<div className="flex items-start space-x-3">
					<RadioGroupItem
						value={UsageModel.PayPerUse}
						id={payPerUseId}
						className="mt-1"
					/>
					<div className="flex-1 space-y-1">
						<div className="flex items-center gap-2">
							<label
								htmlFor={payPerUseId}
								className="text-sm font-medium cursor-pointer"
							>
								Pay-per-use
							</label>
							<InfoIcon size={10} weight="regular" color="#888888" />
						</div>
						<p className="text-sm text-gray-600">
							Charge based on number of units used of this feature
						</p>
					</div>
				</div>

				<div className="flex items-start space-x-3">
					<RadioGroupItem
						value={UsageModel.Prepaid}
						id={prepaidId}
						className="mt-1"
					/>
					<div className="flex-1 space-y-1">
						<div className="flex items-center gap-2">
							<label
								htmlFor={prepaidId}
								className="text-sm font-medium cursor-pointer"
							>
								Prepaid
							</label>
							<InfoIcon size={10} weight="regular" color="#888888" />
						</div>
						<p className="text-sm text-gray-600">
							Specify a quantity of this feature during checkout
						</p>
					</div>
				</div>
			</RadioGroup>
		</div>
	);
}
