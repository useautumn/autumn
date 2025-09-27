import {
	BillingInterval,
	billingToItemInterval,
	itemToBillingInterval,
	type ProductItem,
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
	if (!item) return;

	return (
		<div className="w-full">
			<FormLabel>Billing Interval</FormLabel>
			<Select
				disabled={disabled}
				value={itemToBillingInterval({ item: item })}
				defaultValue={BillingInterval.Month}
				onValueChange={(value) => {
					setItem({
						...item,
						interval: billingToItemInterval({
							billingInterval: value as BillingInterval,
						}),
					});
				}}
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
