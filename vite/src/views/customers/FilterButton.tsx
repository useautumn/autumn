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
import { useSearchParams } from "react-router";
import { useSetSearchParams } from "@/utils/setSearchParams";
import { useEffect } from "react";

function FilterButton() {
  const { setFilters } = useCustomersContext();
  const [searchParams] = useSearchParams();
  const setSearchParams = useSetSearchParams();
  // useEffect(() => {
  //   let statusParam = searchParams.get("status");
  //   let productIdParam = searchParams.get("product_id");
  //   setFilters({ status: statusParam, product_id: productIdParam });
  // }, [searchParams]);

  return (
    <DropdownMenu>
      <RenderFilterTrigger />

      <DropdownMenuContent className="w-56" align="start">
        <FilterStatus />
        <ProductStatus />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() =>
              setSearchParams({
                status: "",
                product_id: "",
              })
            }
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

  const [searchParams] = useSearchParams();
  const setSearchParams = useSetSearchParams();

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-t3 !font-regular text-xs">
        Status
      </DropdownMenuLabel>
      {statuses.map((status: any) => {
        const isActive = searchParams.get("status") === status;
        return (
          <DropdownMenuItem
            key={status}
            onClick={() => {
              if (isActive) {
                // setFilters({ ...filters, status: undefined });
                setSearchParams({ status: "" });
              } else {
                // setFilters({ ...filters, status });
                setSearchParams({ status });
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
  const { products } = useCustomersContext();
  const setSearchParams = useSetSearchParams();
  const [searchParams] = useSearchParams();
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-t3 !font-regular text-xs">
        Product
      </DropdownMenuLabel>
      {products.map((product: any) => {
        const isActive = searchParams.get("product_id") === product.id;
        return (
          <DropdownMenuItem
            key={product.id}
            onClick={() => {
              if (isActive) {
                setSearchParams({ product_id: "" });
              } else {
                setSearchParams({ product_id: product.id });
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
