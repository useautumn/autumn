import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useCustomersContext } from "./CustomersContext";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { Check, ListFilter, X } from "lucide-react";

function FilterButton() {
  const { setFilters } = useCustomersContext();
  
  return (
    <DropdownMenu>
      <RenderFilterTrigger />

      <DropdownMenuContent className="w-56" align="start">
        {/* Search filter properties */}
        <DropdownMenuLabel>Filter</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* 1. Status filter */}

        <FilterStatus />
        {/* 2. Product filter */}
        <ProductStatus />

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => setFilters({})}
            className="cursor-pointer"
          >
            <X size={14} className="text-t3" />
            Clear
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default FilterButton;

export const FilterStatus = () => {
  const { filters, setFilters } = useCustomersContext();
  const statuses = ["canceled", "free_trial"];

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-t3 !font-regular text-xs">
        Status
      </DropdownMenuLabel>
      {statuses.map((status: any) => {
        const isActive = filters?.status === status;
        return (
          <DropdownMenuItem
            key={status}
            onClick={() => {
              if (isActive) {
                setFilters({ ...filters, status: undefined });
              } else {
                setFilters({ ...filters, status });
              }
            }}
            className="flex items-center justify-between cursor-pointer text-sm"
          >
            {keyToTitle(status)}
            {isActive && <Check size={13} className="text-t3" />}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuGroup>
  );
};

export const ProductStatus = () => {
  const { filters, setFilters, products } = useCustomersContext();
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-t3 !font-regular text-xs">
        Product
      </DropdownMenuLabel>
      {products.map((product: any) => {
        const isActive = filters?.product_id === product.id;
        return (
          <DropdownMenuItem
            key={product.id}
            onClick={() => {
              if (isActive) {
                setFilters({ ...filters, product_id: undefined });
              } else {
                setFilters({ ...filters, product_id: product.id });
              }
            }}
            className="flex items-center justify-between cursor-pointer"
          >
            {product.name}
            {isActive && <Check size={13} className="text-t3" />}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuGroup>
  );
};

export const RenderFilterTrigger = ({ setOpen }: any) => {
  return (
    <DropdownMenuTrigger asChild>
      <Button variant="outline" className="text-t3">
        <ListFilter size={13} className="mr-2 text-t3" />
        Filter
      </Button>
    </DropdownMenuTrigger>
  );
};
