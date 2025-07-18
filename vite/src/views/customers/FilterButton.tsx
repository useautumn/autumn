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
import { useSetSearchParams } from "@/utils/setSearchParams";
import { useSearchParams } from "react-router";

function FilterButton() {
  const { setFilters } = useCustomersContext();
  const setSearchParams = useSetSearchParams();

  const clearFilters = () => {
    setFilters({
      status: [],
      product_id: [],
    });
  };

  return (
    <DropdownMenu>
      <RenderFilterTrigger />
      <DropdownMenuContent className="w-56" align="start">
        <FilterStatus />
        <ProductStatus />
        <ProductVersionFilter />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() =>
              setSearchParams({
                status: "",
                product_id: "",
                version: "",
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

  const statuses: string[] = ["canceled", "free_trial"];

  const selectedStatuses = filters.status || [];

  const toggleStatus = (status: string) => {
    const selected = filters.status || [];
    const isSelected = selected.includes(status);

    const updated = isSelected
      ? selected.filter((s: string) => s !== status)
      : [...selected, status];

    setFilters({ ...filters, status: updated });
  };

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-t3 !font-regular text-xs">
        Status
      </DropdownMenuLabel>
      {statuses.map((status: any) => {
        const isActive = selectedStatuses.includes(status);
        return (
          <DropdownMenuItem
            key={status}
            onClick={() => toggleStatus(status)}
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

export const ProductVersionFilter = () => {
  const { versionCounts, products } = useCustomersContext();
  const [searchParams] = useSearchParams();
  const setSearchParams = useSetSearchParams();
  const selectedProductId = searchParams.get("product_id");
  if (!selectedProductId) return null;
  const versionCount = versionCounts?.[selectedProductId] || 1;
  const currentVersion = searchParams.get("version");
  const versionOptions = Array.from({ length: versionCount }, (_, i) => i + 1);
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-t3 !font-regular text-xs">
        Version
      </DropdownMenuLabel>
      {versionOptions.map((version) => {
        const isActive = String(currentVersion) === String(version);
        return (
          <DropdownMenuItem
            key={version}
            onClick={() => {
              if (isActive) {
                setSearchParams({ version: "" });
              } else {
                setSearchParams({ version: String(version) });
              }
            }}
            className="flex items-center justify-between cursor-pointer text-sm"
          >
            v{version}
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
  const selectedProductId = searchParams.get("product_id");
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-t3 !font-regular text-xs">
        Product
      </DropdownMenuLabel>
      {products.map((product: any) => {
        const isActive = selectedProductId === product.id;
        return (
          <DropdownMenuItem
            key={product.id}
            onClick={() => {
              if (isActive) {
                setSearchParams({ product_id: "", version: "" });
              } else {
                setSearchParams({ product_id: product.id, version: "" });
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
