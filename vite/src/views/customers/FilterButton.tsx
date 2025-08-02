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
import { Check, ListFilter, Pin, X } from "lucide-react";
import { SaveViewPopover } from "./SavedViewPopover";
import { useState } from "react";
import { ProductsSubMenu } from "./filter/ProductsSubMenu";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterStatusSubMenu } from "./filter/FilterStatusSubMenu";
import { Separator } from "@/components/ui/separator";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { SavedViews } from "./filter/SavedViews";

function FilterButton() {
  const { setFilters } = useCustomersContext();
  const [open, setOpen] = useState(false);

  const {
    data: savedViewsData,
    isLoading: loading,
    mutate: refetchSavedViews,
  } = useAxiosSWR({
    url: "/saved_views",
  });

  const views = savedViewsData?.views || [];

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
        {views.length > 0 && (
          <SavedViews
            views={views}
            mutateViews={refetchSavedViews}
            setDropdownOpen={setOpen}
          />
        )}
        <div className="flex h-9 items-stretch">
          <DropdownMenuItem
            onClick={(e) => clearFilters()}
            className="cursor-pointer justify-center gap-0 w-full"
          >
            <X size={12} className="mr-2 text-t3" />
            <p className="text-t3">Clear</p>
          </DropdownMenuItem>

          <SaveViewPopover onClose={closeFilterModal} />
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
