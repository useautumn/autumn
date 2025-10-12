import { OnDecrease, OnIncrease, UsageModel } from "@autumn/shared";
import { FormLabel } from "@/components/v2/form/FormLabel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { nullish } from "@/utils/genUtils";
import { shouldShowProrationConfig } from "@/utils/product/productItemUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

const getOnIncreaseText = (option: OnIncrease) => {
	switch (option) {
		case OnIncrease.BillImmediately:
			return "Pay full amount immediately";
		case OnIncrease.ProrateImmediately:
			return "Pay for prorated amount immediately";
		case OnIncrease.ProrateNextCycle:
			return "Add prorated amount to next invoice";
		case OnIncrease.BillNextCycle:
			return "Pay for full amount next cycle";
	}
};

const getOnDecreaseText = ({
	option,
	usageModel,
}: {
	option: OnDecrease;
	usageModel: UsageModel;
}) => {
	switch (option) {
		case OnDecrease.Prorate:
			return "Prorate";
		case OnDecrease.None:
			if (usageModel === UsageModel.Prepaid) {
				return "No proration (balance will be kept till next cycle)";
			}
			return "No proration (usage will be kept till next cycle)";
		case OnDecrease.NoProrations:
			return "No proration";
	}
};

export function ProrationConfig() {
	const { features } = useFeaturesQuery();
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const showProrationConfig = shouldShowProrationConfig({ item, features });

	if (!showProrationConfig) return null;

	const onIncreaseValue =
		item.config?.on_increase || OnIncrease.ProrateImmediately;

	const getOnDecreaseValue = () => {
		if (nullish(item.config?.on_decrease)) {
			return OnDecrease.Prorate;
		}

		if (item.config?.on_decrease === OnDecrease.NoProrations) {
			return OnDecrease.NoProrations;
		}

		if (
			item.config?.on_decrease === OnDecrease.ProrateImmediately ||
			item.config?.on_decrease === OnDecrease.ProrateNextCycle ||
			item.config?.on_decrease === OnDecrease.Prorate
		) {
			return OnDecrease.Prorate;
		}

		return OnDecrease.None;
	};

	const onDecreaseValue = getOnDecreaseValue();

	const increaseText =
		item.usage_model === UsageModel.PayPerUse
			? "On usage increase"
			: "On quantity increase";

	const decreaseText =
		item.usage_model === UsageModel.PayPerUse
			? "On usage decrease"
			: "On quantity decrease";

	const onIncreaseOptions = Object.values(OnIncrease).filter((o) => {
		if (
			item.usage_model === UsageModel.Prepaid &&
			o === OnIncrease.BillImmediately
		) {
			return false;
		}
		return true;
	});

	return (
		<div>
			<span className="text-checkbox-label font-medium">
				Configure proration behaviour
			</span>

			<div className="space-y-4 mt-2">
				<div className="space-y-2">
					<FormLabel>{increaseText}</FormLabel>
					<Select
						value={onIncreaseValue}
						onValueChange={(value) => {
							setItem({
								...item,
								config: { ...item.config, on_increase: value as OnIncrease },
							});
						}}
					>
						<SelectTrigger
							className="w-2/3 [&>span]:truncate"
							onClick={(e) => e.stopPropagation()}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{onIncreaseOptions.map((option) => (
								<SelectItem key={option} value={option}>
									{getOnIncreaseText(option)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<FormLabel>{decreaseText}</FormLabel>
					<Select
						value={onDecreaseValue}
						onValueChange={(value) => {
							setItem({
								...item,
								config: { ...item.config, on_decrease: value as OnDecrease },
							});
						}}
					>
						<SelectTrigger
							className="w-2/3 [&>span]:truncate"
							onClick={(e) => e.stopPropagation()}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{[OnDecrease.Prorate, OnDecrease.None].map((option) => (
								<SelectItem key={option} value={option}>
									{getOnDecreaseText({ option, usageModel: item.usage_model })}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>
	);
}
