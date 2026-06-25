import {
	AllocatedBillingBehavior,
	OnDecrease,
	OnIncrease,
	UsageModel,
} from "@autumn/shared";
import {
	AreaCheckbox,
	FormLabel,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { nullish } from "@/utils/genUtils";
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

/** Visibility is controlled by parent AdvancedSettings */
export function ProrationConfig() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const isPrepaid = item.usage_model === UsageModel.Prepaid;
	const hasProrationKnobs =
		!nullish(item.config?.on_increase) || !nullish(item.config?.on_decrease);
	const usesProratedBilling =
		isPrepaid ||
		(item.config?.allocated_billing_behavior
			? item.config.allocated_billing_behavior ===
				AllocatedBillingBehavior.Prorated
			: hasProrationKnobs);

	const setUsesProratedBilling = (enabled: boolean) => {
		setItem({
			...item,
			config: {
				...item.config,
				allocated_billing_behavior: enabled
					? AllocatedBillingBehavior.Prorated
					: AllocatedBillingBehavior.Arrear,
				on_increase: enabled ? item.config?.on_increase : undefined,
				on_decrease: enabled ? item.config?.on_decrease : undefined,
			},
		});
	};

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
			title="Configure proration behavior"
			checked={usesProratedBilling}
			onCheckedChange={isPrepaid ? undefined : setUsesProratedBilling}
		>
			<div className="space-y-4 w-xs max-w-full">
				<div className="space-y-2 w-full">
					<FormLabel>{increaseText}</FormLabel>
					<Select
						value={onIncreaseValue}
						onValueChange={(value) => {
							setItem({
								...item,
								config: {
									...item.config,
									...(isPrepaid
										? {}
										: {
												allocated_billing_behavior:
													AllocatedBillingBehavior.Prorated,
											}),
									on_increase: value as OnIncrease,
								},
							});
						}}
						items={Object.fromEntries(
							onIncreaseOptions.map((option) => [
								option,
								getOnIncreaseText(option),
							]),
						)}
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
								config: {
									...item.config,
									...(isPrepaid
										? {}
										: {
												allocated_billing_behavior:
													AllocatedBillingBehavior.Prorated,
											}),
									on_decrease: value as OnDecrease,
								},
							});
						}}
						items={Object.fromEntries(
							[OnDecrease.Prorate, OnDecrease.None].map((option) => [
								option,
								getOnDecreaseText({
									option,
									usageModel: item.usage_model ?? UsageModel.Prepaid,
								}),
							]),
						)}
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
