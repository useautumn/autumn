import { useState } from "react";
import { useProductItemContext } from "../../ProductItemContext";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Infinite } from "autumn-js";
import { Button } from "@/components/ui/button";

export const CustomiseIntervalPopover = () => {
  const [open, setOpen] = useState(false);
  const { item, setItem } = useProductItemContext();
  const [intervalCount, setIntervalCount] = useState(item.interval_count || 1);

  const handleSave = () => {
    setItem({
      ...item,
      interval_count: parseInt(intervalCount || 1),
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          // className="h-8 rounded-xs min-w-7.5 max-w-7.5"
          className="w-full justify-start px-2"
          variant="ghost"
          disabled={item.included_usage == Infinite || item.interval == null}
        >
          {/* <ArrowUp01 size={12} className="text-t2" /> */}
          <p className="text-t3">Customise Interval</p>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-2 w-fit"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div>
          <FieldLabel>Interval Count</FieldLabel>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="w-24"
            value={intervalCount}
            onChange={(e) => setIntervalCount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSave();
              }
              if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          <Button variant="outline" className="w-full" onClick={handleSave}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
