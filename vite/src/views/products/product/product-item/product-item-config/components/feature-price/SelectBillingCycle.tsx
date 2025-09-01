import { BillingInterval, UsageModel } from "@autumn/shared";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { formatIntervalText } from "@/utils/formatUtils/formatTextUtils";
import { useProductItemContext } from "../../../ProductItemContext";
import { CustomiseIntervalPopover } from "../CusomiseIntervalPopover";

export const SelectCycle = () => {
	const { item, setItem } = useProductItemContext();

	const handleBillingIntervalSelected = (value: BillingInterval) => {
		let usageModel = item.usage_model;
		if (value === BillingInterval.OneOff) {
			usageModel = UsageModel.Prepaid;
		}

		setItem({
			...item,
			interval: value === BillingInterval.OneOff ? null : value,
			usage_model: usageModel,
		});
	};

	// const intervalText = (interval: BillingInterval) => {
	//   return interval === BillingInterval.SemiAnnual
	//     ? "per half year"
	//     : interval === BillingInterval.OneOff
	//       ? "one off"
	//       : `per ${interval}`;
	// };

	return (
		<div className="w-full">
			<FieldLabel className="flex items-center gap-2">
				Billing Interval
				<InfoTooltip>
					<span className="">
						How often to bill for this feature. Usage will also be reset on this
						period.
					</span>
				</InfoTooltip>
			</FieldLabel>
			<div className="flex flex-col gap-2">
				<div className="flex gap-2 items-center">
					<Select
						value={item.interval ?? BillingInterval.OneOff}
						defaultValue={BillingInterval.Month}
						onValueChange={handleBillingIntervalSelected}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select reset" />
						</SelectTrigger>
						<SelectContent>
							{Object.values(BillingInterval).map((interval) => (
								<SelectItem key={interval} value={interval}>
									{formatIntervalText({
										billingInterval: interval,
										intervalCount: item.interval_count,
										isBillingInterval: true,
									})}
								</SelectItem>
							))}
							<CustomiseIntervalPopover />
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>
	);
};

{
	/* <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <InfoIcon className="w-3 h-3 text-t3/50" />
          </TooltipTrigger>
          <TooltipContent
            sideOffset={5}
            side="top"
            align="start"
            className="flex flex-col"
          >
            {featureItem ? (
              <span className="">
                How often usage counts reset for this feature. Choose "no reset"
                for items that don't expire.
              </span>
            ) : (
              <span className="">
                How often to bill for this feature. Usage will also be reset on
                this period.
              </span>
            )}
          </TooltipContent>
        </Tooltip> */
}
