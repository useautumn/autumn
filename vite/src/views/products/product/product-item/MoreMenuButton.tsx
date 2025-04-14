import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Feature, ProductItem, ProductItemBehavior } from "@autumn/shared";
import { EllipsisVertical, MinusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { useProductItemContext } from "./ProductItemContext";

export default function MoreMenuButton({
  show,
  setShow,
}: {
  show: any;
  setShow: (show: any) => void;
}) {
  const [showPopover, setShowPopover] = useState(false);
  const { item, setItem } = useProductItemContext();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-t3 text-xs bg-transparent border-none shadow-none justify-start"
          onClick={() => setShowPopover(!showPopover)}
          // disabled={!selectedFeature}
        >
          <EllipsisVertical size={14} className="mr-1" />
          More
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2 flex flex-col text-xs" align="end">
        <div className="flex items-center space-x-2">
          <Button
            variant="secondary"
            className="text-xs text-t3 shadow-none border-none w-full justify-start"
            onClick={() => {
              console.log("Button");
              setItem({
                ...item,
                behavior:
                  item.behavior == ProductItemBehavior.Prepaid
                    ? ProductItemBehavior.PayPerUse
                    : ProductItemBehavior.Prepaid,
              });
            }}
          >
            <Checkbox
              className="border-t3 mr-1"
              checked={item?.behavior == ProductItemBehavior.Prepaid}
            />
            Prepaid
          </Button>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="secondary"
            className="text-xs text-t3 shadow-none border-none"
            onClick={() => {
              setItem({
                ...item,
                carry_over_usage: !item.carry_over_usage,
              });
            }}
          >
            <Checkbox
              className="border-t3 mr-1"
              checked={item?.carry_over_usage}
              onCheckedChange={(checked) =>
                setItem({
                  ...item,
                  carry_over_usage: Boolean(checked),
                })
              }
            />
            Keep usage on upgrade
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
          {show.perEntity ? "Remove Per Entity" : "Add Per Entity"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
