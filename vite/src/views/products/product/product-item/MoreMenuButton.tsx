import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { EllipsisVertical, MinusIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useProductItemContext } from "./ProductItemContext";
import { ProductItem, UsageModel } from "@autumn/shared";

export default function MoreMenuButton({
  show,
  setShow,
}: {
  show: any;
  setShow: (show: any) => void;
}) {
  const [showPopover, setShowPopover] = useState(false);
  const {
    item,
    setItem,
  }: { item: ProductItem; setItem: (item: ProductItem) => void } =
    useProductItemContext();

  const [checkedChanged, setCheckedChanged] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  return (
    <Popover open={showPopover} onOpenChange={setShowPopover}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-t3 text-xs bg-transparent border-none shadow-none justify-start"
          onClick={() => setShowPopover(!showPopover)}
        >
          <EllipsisVertical size={14} className="" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-fit min-w-48 p-0 py-1 flex flex-col text-xs"
        align="end"
      >
        <div className="flex items-center space-x-2">
          <Button
            variant="secondary"
            className="text-xs text-t2 shadow-none border-none w-full justify-start"
            onClick={() => {
              setCheckedChanged(true);
              setItem({
                ...item,
                reset_usage_when_enabled: !item.reset_usage_when_enabled,
              });
            }}
          >
            <Checkbox
              className="border-t3 mr-1"
              checked={item.reset_usage_when_enabled || false}
            />
            Reset usage when product is enabled
          </Button>
        </div>
        <Button
          className="h-7 shadow-none text-t3 text-xs justify-start border-none"
          variant="outline"
          startIcon={
            show.perEntity ? (
              <MinusIcon size={14} className="ml-0.5 mr-1" />
            ) : (
              <PlusIcon size={14} className="ml-0.5 mr-1" />
            )
          }
          onClick={() => {
            setShow({ ...show, perEntity: !show.perEntity });
            setShowPopover(false);
          }}
        >
          {show.perEntity
            ? "Remove per feature entity"
            : "Add per feature entity"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export const MoreMenuPriceButton = () => {
  const [showPopover, setShowPopover] = useState(false);
  const { item, setItem } = useProductItemContext();

  return (
    <Popover open={showPopover} onOpenChange={setShowPopover}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-t3 text-xs bg-transparent border-none shadow-none justify-start"
          onClick={() => setShowPopover(!showPopover)}
        >
          <EllipsisVertical size={14} className="" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0 flex flex-col text-xs" align="end">
        <div className="flex items-center space-x-2">
          <Button
            variant="secondary"
            className="text-xs text-t2 shadow-none border-none w-full justify-start"
            onClick={() => {
              setItem({
                ...item,
                usage_model:
                  item.usage_model == UsageModel.Prepaid
                    ? UsageModel.PayPerUse
                    : UsageModel.Prepaid,
              });
            }}
          >
            <Checkbox
              className="border-t3 mr-1"
              checked={item.usage_model == UsageModel.Prepaid}
            />
            Usage is Prepaid
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
