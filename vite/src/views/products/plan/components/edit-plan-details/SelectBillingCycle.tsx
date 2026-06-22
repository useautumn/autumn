import {
	BillingInterval,
	billingToItemInterval,
	itemToBillingInterval,
	type ProductItem,
} from "@autumn/shared";
import {
	FormLabel,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { formatIntervalText } from "@/utils/formatUtils/formatTextUtils";
import { CustomiseIntervalPopover } from "../CustomiseIntervalPopover";

export const SelectBillingCycle = ({
	item,
	setItem,
	disabled,
	filterOneOff,
}: {
	item?: ProductItem;
	setItem: (item: ProductItem) => void;
	disabled: boolean;
	filterOneOff?: boolean;
}) => {
	return (
		<div className="w-full">
			<FormLabel disabled={disabled}>Billing Interval</FormLabel>
			<Select
				disabled={disabled}
				value={item ? itemToBillingInterval({ item }) : BillingInterval.Month}
				defaultValue={BillingInterval.Month}
				onValueChange={(value) => {
					if (!item) return;
					setItem({
						...item,
						interval: billingToItemInterval({
							billingInterval: value as BillingInterval,
						}),
					});
				}}
				items={Object.fromEntries(
					Object.values(BillingInterval)
						.filter(
							(interval) =>
								!filterOneOff || interval !== BillingInterval.OneOff,
						)
						.map((interval) => [
							interval,
							formatIntervalText({
								billingInterval: interval,
								intervalCount: item?.interval_count || 1,
								isBillingInterval: true,
							}),
						]),
				)}
			>
				<SelectTrigger className="w-full">
					<SelectValue placeholder="Select interval" />
				</SelectTrigger>
				<SelectContent>
					{Object.values(BillingInterval)
						.filter((interval) => {
							if (filterOneOff) {
								return interval !== BillingInterval.OneOff;
							}
							return true;
						})
						.map((interval) => (
							<SelectItem key={interval} value={interval}>
								{formatIntervalText({
									billingInterval: interval,
									intervalCount: item?.interval_count || 1,
									isBillingInterval: true,
								})}
							</SelectItem>
						))}
					{item && <CustomiseIntervalPopover item={item} setItem={setItem} />}
				</SelectContent>
			</Select>
		</div>
	);
};
