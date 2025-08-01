import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useCustomersContext } from "./CustomersContext";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { Check, ListFilter, X } from "lucide-react";
import { SaveViewPopover } from "./SavedViewPopover";
import { useState } from "react";
import { ProductsSubMenu } from "./filter/ProductsSubMenu";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterStatusSubMenu } from "./filter/FilterStatusSubMenu";

function FilterButton() {
  const { setFilters } = useCustomersContext();
  const [open, setOpen] = useState(false);

  const clearFilters = () => {
    setFilters({
      status: [],
      product_id: [],
      version: "",
    });
  };

  const closeFilterModal = () => {
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <RenderFilterTrigger />
      <DropdownMenuContent
        className="w-56 font-regular text-zinc-800 gap-0 p-0"
        align="start"
      >
        <DropdownMenuGroup className="p-1">
          <FilterStatusSubMenu />
          <ProductsSubMenu />
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="m-0" />
        <div className="flex h-9 items-stretch p-1 gap-2">
          <DropdownMenuItem
            onClick={(e) => {
              clearFilters();
            }}
            className="cursor-pointer flex-1 flex items-center justify-center h-full p-0"
          >
            <X size={14} className="mr-2 text-t3" />
            Clear
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              clearFilters();
            }}
            className="cursor-pointer flex-1 flex items-center justify-center h-full p-0"
          >
            <X size={14} className="mr-2 text-t3" />
            Clear
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default FilterButton;

export const RenderFilterTrigger = ({ setOpen }: any) => {
  return (
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        className="text-t3 bg-transparent shadow-none p-0"
      >
        <ListFilter size={13} className="mr-2 text-t3" />
        Filter
      </Button>
    </DropdownMenuTrigger>
  );
};
