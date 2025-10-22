import {
	BillingInterval,
	EntInterval,
	Infinite,
	UsageModel,
} from "@autumn/shared";
import { useState } from "react";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { Input } from "@/components/ui/input";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { itemIsUnlimited } from "@/utils/product/productItemUtils";
import { useProductItemContext } from "../../ProductItemContext";

export const IncludedUsage = () => {
	const { item, setItem } = useProductItemContext();
	const isFeaturePrice = isFeaturePriceItem(item);
	const [open, setOpen] = useState(false);
	const [intervalCount, setIntervalCount] = useState<number | string>(
		item.interval_count || 1,
	);

	const handleBillingIntervalSelected = (
		value: BillingInterval | EntInterval,
	) => {
		let usageModel = item.usage_model;
		if (value === BillingInterval.OneOff) {
			usageModel = UsageModel.Prepaid;
		}

		setItem({
			...item,
			interval:
				value === BillingInterval.OneOff || value === EntInterval.Lifetime
					? null
					: value,
			usage_model: usageModel,
		});
	};

	const handleSaveCustomInterval = () => {
		setItem({
			...item,
			interval_count: parseInt(intervalCount.toString()),
		});
		setOpen(false);
	};

	// Get current interval for display
	const currentInterval = item.interval ?? BillingInterval.OneOff;

	return (
		<div className="w-full transition-all duration-400 ease-in-out space-y-4">
			<div className="space-y-2">
				<FieldLabel className="flex items-center gap-2">
					Included Usage
					<InfoTooltip>
						<span className="">
							How much of this feature can be used for free with this plan. If
							there is no price, it is a usage limit.
							<br />
							<br />
							Leave this blank if the feature is paid-only. Eg, 10 USD per seat.
						</span>
					</InfoTooltip>
				</FieldLabel>
				<div className="flex w-full h-fit gap-2">
					<Input
						placeholder="eg. 300"
						className=""
						disabled={item.included_usage == Infinite}
						value={
							item.included_usage == Infinite
								? "Unlimited"
								: item.included_usage || ""
						}
						type={item.included_usage === Infinite ? "text" : "number"}
						onChange={(e) => {
							const newItem = {
								...item,
								included_usage: e.target.value,
							};

							setItem(newItem);
						}}
					/>
					<ToggleDisplayButton
						label="Unlimited"
						show={item.included_usage == Infinite}
						className="h-8"
						disabled={isFeaturePrice}
						onClick={() => {
							if (itemIsUnlimited(item)) {
								setItem({
									...item,
									included_usage: "",
								});
							} else {
								setItem({
									...item,
									included_usage: Infinite,
									interval: null,
								});
							}
						}}
					>
						♾️
					</ToggleDisplayButton>
				</div>
			</div>
		</div>
	);
};
