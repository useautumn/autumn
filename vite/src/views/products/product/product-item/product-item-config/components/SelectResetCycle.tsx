import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Select } from "@/components/ui/select";
import { useProductItemContext } from "../../ProductItemContext";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import {
  BillingInterval,
  EntInterval,
  FeatureUsageType,
  Infinite,
} from "@autumn/shared";
import { itemToEntInterval } from "@/utils/product/itemIntervalUtils";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { getFeatureUsageType } from "@/utils/product/entitlementUtils";
import { useProductContext } from "../../../ProductContext";
import { Button } from "@/components/ui/button";
import { ArrowUp01, CheckIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { Input } from "@/components/ui/input";
import { CustomiseIntervalPopover } from "./CusomiseIntervalPopover";

const getIntervalText = ({
  interval,
  intervalCount,
  billingInterval,
}: {
  interval?: EntInterval;
  billingInterval?: BillingInterval;
  intervalCount?: number;
}) => {
  const finalInterval = interval ?? billingInterval;
  if (
    finalInterval === EntInterval.Lifetime ||
    finalInterval === BillingInterval.OneOff
  ) {
    return "no reset";
  }
  if (intervalCount && intervalCount > 1) {
    return `per ${intervalCount} ${finalInterval}s`;
  }
  return finalInterval === BillingInterval.SemiAnnual
    ? "per half year"
    : `per ${finalInterval}`;
};

export const SelectResetCycle = () => {
  const { features } = useProductContext();
  const { item, setItem } = useProductItemContext();

  const handleChange = (value: EntInterval) => {
    setItem({
      ...item,
      interval: value == EntInterval.Lifetime ? null : (value as EntInterval),
    });
  };

  const isFeaturePrice = isFeaturePriceItem(item);
  const usageType = getFeatureUsageType({ item, features });

  if (usageType === FeatureUsageType.Continuous) {
    return null;
  }

  const interval = itemToEntInterval(item);

  return (
    <div
      className={cn(
        "transition-all duration-300 ease-in-out",
        isFeaturePrice ? "w-0 overflow-hidden" : "w-60"
      )}
    >
      <FieldLabel className="flex items-center gap-2">
        <span className="whitespace-nowrap truncate">Reset Interval</span>
        <InfoTooltip>
          <span className="">
            How often usage counts reset for this feature. Choose "no reset" for
            items that don't expire.
          </span>
        </InfoTooltip>
      </FieldLabel>
      <div className="flex items-center gap-2">
        <Select
          disabled={item.included_usage == Infinite}
          value={itemToEntInterval(item) as string}
          onValueChange={(value) => {
            handleChange(value as EntInterval);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select reset" className="w-full">
              <span className="block truncate overflow-hidden text-ellipsis max-w-full">
                {getIntervalText({
                  interval,
                  intervalCount: item.interval_count,
                })}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="w-48">
            {Object.values(EntInterval).map((intervalOption) => {
              const isSelected = intervalOption === interval;
              return (
                <SelectIntervalItem
                  key={intervalOption}
                  interval={intervalOption}
                  isSelected={isSelected}
                />
              );
            })}
            <CustomiseIntervalPopover />
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

// const SelectIntervalCountPopover = () => {
//   const [open, setOpen] = useState(false);
//   const { item, setItem } = useProductItemContext();
//   const [intervalCount, setIntervalCount] = useState(item.interval_count || 1);

//   const handleSave = () => {
//     setItem({
//       ...item,
//       interval_count: parseInt(intervalCount || 1),
//     });
//     setOpen(false);
//   };

//   return (
//     <Popover open={open} onOpenChange={setOpen}>
//       <PopoverTrigger asChild>
//         <Button
//           // className="h-8 rounded-xs min-w-7.5 max-w-7.5"
//           className="w-full justify-start px-2"
//           variant="ghost"
//           disabled={item.included_usage == Infinite || item.interval == null}
//         >
//           {/* <ArrowUp01 size={12} className="text-t2" /> */}
//           <p className="text-t3">Customise Interval</p>
//         </Button>
//       </PopoverTrigger>
//       <PopoverContent
//         align="start"
//         className="p-2 w-fit"
//         onOpenAutoFocus={(e) => e.preventDefault()}
//         onCloseAutoFocus={(e) => e.preventDefault()}
//       >
//         <div>
//           <FieldLabel>Interval Count</FieldLabel>
//         </div>
//         <div className="flex items-center gap-2">
//           <Input
//             className="w-24"
//             value={intervalCount}
//             onChange={(e) => setIntervalCount(e.target.value)}
//             onKeyDown={(e) => {
//               if (e.key === "Enter") {
//                 handleSave();
//               }
//               if (e.key === "Escape") {
//                 setOpen(false);
//               }
//             }}
//           />
//           <Button variant="outline" className="w-full" onClick={handleSave}>
//             Save
//           </Button>
//         </div>
//       </PopoverContent>
//     </Popover>
//   );
// };

const SelectIntervalItem = ({
  interval,
  isSelected,
}: {
  interval: EntInterval;
  isSelected: boolean;
}) => {
  const { item } = useProductItemContext();
  const [hover, setHover] = useState(false);

  return (
    <SelectItem
      key={interval}
      value={interval}
      className="group flex items-center justify-between w-full"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center gap-2 w-full whitespace-nowrap truncate overflow-hidden">
        <span className="truncate">
          {getIntervalText({ interval, intervalCount: item?.interval_count })}
        </span>
      </div>
    </SelectItem>
  );
};
