import { BillingInterval, type ProductItem } from "@autumn/shared";
import { FormLabel } from "@/components/v2/form/FormLabel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { formatIntervalText } from "@/utils/formatUtils/formatTextUtils";
import { CustomiseIntervalPopover } from "../CustomiseIntervalPopover";

export const SelectBillingCycle = ({
	item,
	setItem,
	disabled,
}: {
	item?: ProductItem;
	setItem: (item: ProductItem) => void;
	disabled: boolean;
}) => {
	const handleBillingIntervalSelected = (value: BillingInterval) => {
		if (!item) return;
		
		setItem({
			...item,
			interval: value === BillingInterval.OneOff ? null : value,
		});
	};

	return (
		<div className="w-full">
			<FormLabel>Billing Interval</FormLabel>
			<Select
				disabled={disabled}
				value={item?.interval ?? BillingInterval.OneOff}
				defaultValue={BillingInterval.Month}
				onValueChange={handleBillingIntervalSelected}
			>
				<SelectTrigger className="w-full">
					<SelectValue placeholder="Select interval" />
				</SelectTrigger>
				<SelectContent>
					{Object.values(BillingInterval).map((interval) => (
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
