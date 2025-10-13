import {
	BillingInterval,
	billingToItemInterval,
	EntInterval,
	entToItemInterval,
	isFeaturePriceItem,
	itemToBillingInterval,
	itemToEntInterval,
	UsageModel,
} from "@autumn/shared";
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

	const handleBillingIntervalSelected = (
		value: BillingInterval | EntInterval,
	) => {
		setItem({
			...item,
			interval: isFeaturePrice
				? billingToItemInterval({
						billingInterval: value as BillingInterval,
					})
				: entToItemInterval({
						entInterval: value as EntInterval,
					}),
		});
	};

	const label = showBillingLabel
		? "Usage Reset & Billing Interval"
		: "Usage Reset";

	return (
		<div className={showBillingLabel ? "mt-3" : ""}>
			<FormLabel>{label}</FormLabel>
			<Select
				value={
					isFeaturePrice
						? itemToBillingInterval({ item })
						: itemToEntInterval({ item })
				}
				onValueChange={handleBillingIntervalSelected}
			>
				<SelectTrigger className="w-full">
					<SelectValue placeholder="Select interval" />
				</SelectTrigger>
				<SelectContent>
					{Object.values(isFeaturePrice ? BillingInterval : EntInterval)
						.filter((i) => {
							if (isFeaturePrice && item.usage_model === UsageModel.PayPerUse) {
								return i !== BillingInterval.OneOff;
							}
							return true;
						})
						.map((interval) => (
							<SelectItem key={interval} value={interval}>
								{formatIntervalText({
									billingInterval: interval,
									intervalCount: item.interval_count || undefined,
									isBillingInterval: true,
								})}
							</SelectItem>
						))}

					{/* Custom interval option */}
					<CustomiseIntervalPopover item={item} setItem={setItem} />
				</SelectContent>
			</Select>
		</div>
	);
}
