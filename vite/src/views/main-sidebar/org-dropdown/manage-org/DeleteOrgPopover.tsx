import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useOrg } from "@/hooks/useOrg";
import { useState } from "react";

export const DeleteOrgPopover = () => {
  const { org } = useOrg();
  const [confirmText, setConfirmText] = useState("");
  const handleDeleteOrg = () => {
    console.log("delete org");
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="destructive" className="w-fit">
          Delete Organization
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="border border-zinc-200">
        <div className="flex flex-col gap-4 text-sm w-fit">
          <p className="text-t3">
            Are you sure you want to delete this organization?
          </p>
          <Input
            variant="destructive"
            placeholder={`Type "${org?.name}" to confirm`}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
          <Button variant="outline" className="w-fit">
            Confirm
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
