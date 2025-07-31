import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useCustomersContext } from "./CustomersContext";
import { getBackendErr } from "@/utils/genUtils";
import { Save, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const SaveDashboardPopover = () => {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const axiosInstance = useAxiosInstance();
  const { mutateDashboards } = useCustomersContext();

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a dashboard name");
      return;
    }

    try {
      setLoading(true);
      
      // Get current search params and encode as base64
      const currentParams = new URLSearchParams(window.location.search);
      // Remove page and lastItemId from saved params
      currentParams.delete("page");
      currentParams.delete("lastItemId");
      
      const paramsString = currentParams.toString();
      const encodedParams = btoa(paramsString);

      await axiosInstance.post("/v1/dashboards/save", {
        name: name.trim(),
        filters: encodedParams,
      });

      toast.success(`Dashboard "${name}" saved successfully`);
      setName("");
      setOpen(false);
      mutateDashboards(); // Refresh the dashboards list
    } catch (error) {
      console.error(error);
      toast.error(getBackendErr(error, "Failed to save dashboard"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="text-t3 bg-transparent shadow-none w-full h-full flex items-center justify-center p-2">
          <Save size={13} className="mr-2 text-t3" />
          Save
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="border border-zinc-200 bg-stone-50 flex flex-col gap-3 pt-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={() => setOpen(false)}
        onPointerDownOutside={() => setOpen(false)}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-1 text-t3">
          <Save size={12} />
          <p className="text-t3 text-sm">Save dashboard</p>
        </div>

        <div className="flex flex-col gap-2">
          <Input
            className="h-7"
            placeholder="Dashboard name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSave();
              }
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              className="!h-6.5 !mt-0 text-xs"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="gradientPrimary"
              className="!h-6.5 !mt-0 text-xs"
              startIcon={<PlusIcon size={10} />}
              onClick={handleSave}
              isLoading={loading}
            >
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};