import { OnDecrease, OnIncrease, UsageModel } from "@autumn/shared";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
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
			return "Bill full amount immediately";
		case OnIncrease.ProrateImmediately:
			return "Bill prorated amount immediately";
		case OnIncrease.ProrateNextCycle:
			return "Bill prorated amount next cycle";
		case OnIncrease.BillNextCycle:
			return "Bill from next cycle";
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
			return "Prorate (refund unused time)";
		case OnDecrease.None:
			return "No proration (purchased amount is kept till next cycle)";
		case OnDecrease.NoProrations:
			return "No proration (purchased amount is cleared)";
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
		<AreaCheckbox
			title="Configure proration behaviour"
			checked={true}
			// disabled={true}
		>
			<div className="space-y-4 w-xs max-w-full">
				<div className="space-y-2 w-full">
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
							className="w-full [&>span]:truncate"
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

				<div className="space-y-2 w-full">
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
							className="w-full [&>span]:truncate"
							onClick={(e) => e.stopPropagation()}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{[OnDecrease.Prorate, OnDecrease.None].map((option) => (
								<SelectItem key={option} value={option}>
									{getOnDecreaseText({
										option,
										usageModel: item.usage_model ?? UsageModel.Prepaid,
									})}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</AreaCheckbox>
	);
}
