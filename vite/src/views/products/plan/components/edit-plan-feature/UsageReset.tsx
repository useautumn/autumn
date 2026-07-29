import {
	BillingInterval,
	billingToItemInterval,
	EntInterval,
	entToItemInterval,
	Infinite,
	isFeaturePriceItem,
	itemToBillingInterval,
	itemToEntInterval,
	nullish,
	UsageModel,
} from "@autumn/shared";
import {
	FormLabel,
	IconCheckbox,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { CalendarXIcon } from "@phosphor-icons/react";
import { formatIntervalText } from "@/utils/formatUtils/formatTextUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { CustomiseIntervalPopover } from "../CustomiseIntervalPopover";

interface UsageResetProps {
	showBillingLabel?: boolean;
}

export function UsageReset({ showBillingLabel = false }: UsageResetProps) {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const isFeaturePrice = isFeaturePriceItem(item);
	const isUnlimited = item.included_usage === Infinite;

	// When a prepaid feature resets on a different cycle to billing, this dropdown
	// drives the billing interval (price_interval); the reset lives in `interval`.
	const isSeparateResetActive = isFeaturePrice && !nullish(item.price_interval);
	const intervalField = isSeparateResetActive ? "price_interval" : "interval";
	const countField = isSeparateResetActive
		? "price_interval_count"
		: "interval_count";

	// Helper functions to reduce repetition
	const getIntervalValue = () => {
		return isFeaturePrice
			? itemToBillingInterval({ item })
			: itemToEntInterval({ item });
	};

	const getOneOffInterval = () => {
		return isFeaturePrice ? BillingInterval.OneOff : EntInterval.Lifetime;
	};

	const getMonthlyInterval = () => {
		return isFeaturePrice ? BillingInterval.Month : EntInterval.Month;
	};

	const convertToItemInterval = (value: BillingInterval | EntInterval) => {
		return isFeaturePrice
			? billingToItemInterval({ billingInterval: value as BillingInterval })
			: entToItemInterval({ entInterval: value as EntInterval });
	};

	// Derived state
	const intervalValue = getIntervalValue();
	const isOneOff = !isUnlimited && intervalValue === getOneOffInterval();
	const isSelectDisabled = isOneOff || isUnlimited;

	// Handlers
	const handleIntervalChange = (value: BillingInterval | EntInterval) => {
		setItem({
			...item,
			usage_model:
				value === BillingInterval.OneOff
					? UsageModel.Prepaid
					: item.usage_model,
			[intervalField]: convertToItemInterval(value),
		});
	};

	const handleOneOffToggle = (checked: boolean) => {
		const targetInterval = checked ? getOneOffInterval() : getMonthlyInterval();

		setItem({
			...item,
			...(checked && isFeaturePrice && { usage_model: UsageModel.Prepaid }),
			interval: convertToItemInterval(targetInterval),
		});
	};

	// Get available interval options
	const availableIntervals = Object.values(
		isFeaturePrice ? BillingInterval : EntInterval,
	).filter((interval) => {
		const oneOffInterval = getOneOffInterval();
		return interval !== oneOffInterval;
	});

	return (
		<div className={showBillingLabel ? "mt-3" : ""}>
			<FormLabel>Interval</FormLabel>
			<div className="flex items-center gap-2">
				<Select
					value={isSelectDisabled ? undefined : intervalValue}
					onValueChange={handleIntervalChange}
					disabled={isSelectDisabled}
					items={Object.fromEntries(
						availableIntervals.map((interval) => [
							interval,
							formatIntervalText({
								billingInterval: interval,
								intervalCount: item[countField] || undefined,
								isBillingInterval: true,
							}),
						]),
					)}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="None" />
					</SelectTrigger>
					<SelectContent>
						{availableIntervals.map((interval) => (
							<SelectItem key={interval} value={interval}>
								{formatIntervalText({
									billingInterval: interval,
									intervalCount: item[countField] || undefined,
									isBillingInterval: true,
								})}
							</SelectItem>
						))}
						<CustomiseIntervalPopover
							item={item}
							setItem={setItem}
							countField={countField}
						/>
					</SelectContent>
				</Select>

				<IconCheckbox
					icon={<CalendarXIcon />}
					// iconOrientation="center"
					iconOrientation="left"
					variant="secondary"
					size="default"
					checked={isOneOff}
					onCheckedChange={handleOneOffToggle}
					disabled={isUnlimited || isSeparateResetActive}
					className="py-1 w-26 text-subtle gap-2 justify-start"
				>
					One-off
				</IconCheckbox>
			</div>
		</div>
	);
}
