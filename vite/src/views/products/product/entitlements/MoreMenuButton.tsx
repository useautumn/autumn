import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EllipsisVertical, MinusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

export default function MoreMenuButton({
  fields,
  setFields,
  showPerEntity,
  setShowPerEntity,
}: {
  fields: any;
  setFields: (fields: any) => void;
  showPerEntity: boolean;
  setShowPerEntity: (showPerEntity: boolean) => void;
}) {
  const [showPopover, setShowPopover] = useState(false);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-t3 text-xs"
          onClick={() => setShowPopover(!showPopover)}
        >
          <EllipsisVertical size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2 flex flex-col text-xs" align="end">
        <div className="flex items-center space-x-2">
          <Button
            variant="secondary"
            className="text-xs text-t3 shadow-none border-none"
            onClick={() => {
              setFields({
                ...fields,
                carry_from_previous: !fields.carry_from_previous,
              });
            }}
          >
            <Checkbox
              className="border-t3 mr-1"
              checked={fields.carry_from_previous}
              onCheckedChange={(checked) =>
                setFields({
                  ...fields,
                  carry_from_previous: Boolean(checked),
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
            showPerEntity ? (
              <MinusIcon size={14} className="ml-0.5 mr-1" />
            ) : (
              <PlusIcon size={14} className="ml-0.5 mr-1" />
            )
          }
          onClick={() => {
            setShowPerEntity(!showPerEntity);
            // hide the popover
            setShowPopover(false);
          }}
        >
          {showPerEntity ? "Remove Per Entity" : "Add Per Entity"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
