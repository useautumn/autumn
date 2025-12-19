import {
	BillingInterval,
	billingToItemInterval,
	EntInterval,
	entToItemInterval,
	Infinite,
	isFeaturePriceItem,
	itemToBillingInterval,
	itemToEntInterval,
	UsageModel,
} from "@autumn/shared";
import { CalendarXIcon } from "@phosphor-icons/react";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import { FormLabel } from "@/components/v2/form/FormLabel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
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
			interval: convertToItemInterval(value),
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
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="None" />
					</SelectTrigger>
					<SelectContent>
						{availableIntervals.map((interval) => (
							<SelectItem key={interval} value={interval}>
								{formatIntervalText({
									billingInterval: interval,
									intervalCount: item.interval_count || undefined,
									isBillingInterval: true,
								})}
							</SelectItem>
						))}
						<CustomiseIntervalPopover item={item} setItem={setItem} />
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
					disabled={isUnlimited}
					className="py-1 w-26 text-t4 gap-2 justify-start"
				>
					One-off
				</IconCheckbox>
			</div>
		</div>
	);
}
