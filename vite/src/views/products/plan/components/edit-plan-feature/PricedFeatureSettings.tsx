import {
	AllocatedBillingBehavior,
	BillingInterval,
	FeatureUsageType,
	itemToBillingInterval,
	nullish,
	ProductItemInterval,
	TierBehavior,
	UsageModel,
} from "@autumn/shared";
import { AreaRadioGroupItem, FormLabel, RadioGroup } from "@autumn/ui";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function PricedFeatureSettings() {
	const { item, setItem } = useProductItemContext();
	const { features } = useFeaturesQuery();

	if (!item) return null;

	const isOneOff = itemToBillingInterval({ item }) === BillingInterval.OneOff;
	const isVolumeBased =
		item.tier_behavior === TierBehavior.VolumeBased &&
		(item.tiers?.length ?? 0) > 1;

	const handleUsageModelChange = (value: string) => {
		const usageModel = value as UsageModel;
		const feature = features.find((f) => f.id === item.feature_id);
		const isAllocatedUsageBased =
			usageModel === UsageModel.PayPerUse &&
			feature?.config?.usage_type === FeatureUsageType.Continuous;
		const hasProrationKnobs =
			!nullish(item.config?.on_increase) || !nullish(item.config?.on_decrease);
		const getConfig = () => {
			if (isAllocatedUsageBased) {
				return {
					...item.config,
					allocated_billing_behavior:
						item.config?.allocated_billing_behavior ??
						(hasProrationKnobs
							? AllocatedBillingBehavior.Prorated
							: AllocatedBillingBehavior.Arrear),
				};
			}

			const { allocated_billing_behavior, ...config } = item.config ?? {};
			return Object.keys(config).length > 0 ? config : undefined;
		};

		setItem({
			...item,
			usage_model: usageModel,
			config: getConfig(),
			interval:
				usageModel === UsageModel.PayPerUse && nullish(item.interval)
					? ProductItemInterval.Month
					: item.interval,
		});
	};

	return (
		<div>
			<FormLabel>Billing Method</FormLabel>
			<RadioGroup
				value={item.usage_model}
				onValueChange={handleUsageModelChange}
				className="space-y-0"
			>
				<AreaRadioGroupItem
					value={UsageModel.PayPerUse}
					label="Usage-based"
					description={"Bill for how much the customer uses"}
					disabledReason={
						isVolumeBased
							? "Volume-based pricing requires prepaid billing."
							: isOneOff
								? "Usage based prices must have an interval."
								: undefined
					}
				/>
				<AreaRadioGroupItem
					value={UsageModel.Prepaid}
					label="Prepaid"
					description="Purchase a fixed quantity upfront"
				/>
			</RadioGroup>
		</div>
	);
}
