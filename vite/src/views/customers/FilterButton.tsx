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
import { SaveDashboardPopover } from "./SaveDashboardPopover";
import { SavedDashboardsDropdown } from "./SavedDashboardsDropdown";

function FilterButton() {
  const { setFilters } = useCustomersContext();

  const clearFilters = () => {
    setFilters({
      status: [],
      product_id: [],
      version: "",
    });
  };

  return (
    <DropdownMenu>
      <RenderFilterTrigger />
      <DropdownMenuContent className="w-56" align="start">
        <FilterStatus />
        <ProductStatus />
        <DropdownMenuSeparator />
        <div className="flex items-stretch px-0 py-0 gap-2">
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              clearFilters();
            }}
            onSelect={(e) => e.preventDefault()}
            className="cursor-pointer flex-1 flex items-center justify-center h-full"
          >
            <X size={14} className="mr-2 text-t3" />
            Clear
          </DropdownMenuItem>
          <div className="flex-1 flex">
            <div className="w-full">
              <SaveDashboardPopover />
            </div>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default FilterButton;

export const FilterStatus = () => {
  const { filters, setFilters } = useCustomersContext();

  const statuses: string[] = ["canceled", "free_trial", "expired"];

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
            onClick={(e) => {
              e.preventDefault();
              toggleStatus(status);
            }}
            onSelect={(e) => e.preventDefault()}
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
  const { products, versionCounts, filters, setFilters } = useCustomersContext();
  const selectedVersions = filters.version ? filters.version.split(",").filter(Boolean) : [];
  
  // Deduplicate products by ID (since backend may return multiple entries per product, one per version)
  const uniqueProducts = products?.reduce((acc: any[], product: any) => {
    if (!acc.find(p => p.id === product.id)) {
      acc.push(product);
    }
    return acc;
  }, []) || [];
  
  // Get all possible product:version combinations
  const getAllProductVersions = () => {
    const productVersions: Array<{productId: string, version: string, key: string}> = [];
    uniqueProducts?.forEach((product: any) => {
      const versionCount = versionCounts?.[product.id] || 1;
      for (let v = 1; v <= versionCount; v++) {
        productVersions.push({
          productId: product.id,
          version: v.toString(),
          key: `${product.id}:${v}`
        });
      }
    });
    return productVersions;
  };

  const allProductVersions = getAllProductVersions();
  const allSelected = allProductVersions.length > 0 && allProductVersions.every(pv => selectedVersions.includes(pv.key));
  
  const handleSelectAll = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (allSelected) {
      // Deselect all
      setFilters({ 
        ...filters, 
        product_id: "",
        version: ""
      });
    } else {
      // Select all product:version combinations
      setFilters({ 
        ...filters, 
        product_id: "", // Will be handled by version selections
        version: allProductVersions.map(pv => pv.key).join(",")
      });
    }
  };

  const toggleProduct = (product: any) => {
    const versionCount = versionCounts?.[product.id] || 1;
    const productVersionKeys = Array.from({ length: versionCount }, (_, i) => `${product.id}:${i + 1}`);
    
    const allProductVersionsSelected = productVersionKeys.every(key => selectedVersions.includes(key));
    
    let newSelectedVersions;
    if (allProductVersionsSelected) {
      // Deselect all versions of this product
      newSelectedVersions = selectedVersions.filter((key: string) => !productVersionKeys.includes(key));
    } else {
      // Select all versions of this product
      const toAdd = productVersionKeys.filter(key => !selectedVersions.includes(key));
      newSelectedVersions = [...selectedVersions, ...toAdd];
    }
    
    setFilters({
      ...filters,
      product_id: "",
      version: newSelectedVersions.join(",")
    });
  };

  const toggleVersion = (productId: string, version: string) => {
    const versionKey = `${productId}:${version}`;
    const isSelected = selectedVersions.includes(versionKey);
    
    let newSelectedVersions;
    if (isSelected) {
      newSelectedVersions = selectedVersions.filter((key: string) => key !== versionKey);
    } else {
      newSelectedVersions = [...selectedVersions, versionKey];
    }
    
    setFilters({
      ...filters,
      product_id: "",
      version: newSelectedVersions.join(",")
    });
  };
  
  return (
    <DropdownMenuGroup>
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="text-t3 font-regular text-xs">Products</span>
        <button 
          onClick={handleSelectAll}
          className="text-t3 text-xs hover:text-t1 transition-colors cursor-pointer"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {uniqueProducts?.map((product: any) => {
        const versionCount = versionCounts?.[product.id] || 1;
        const productVersionKeys = Array.from({ length: versionCount }, (_, i) => `${product.id}:${i + 1}`);
        const allProductVersionsSelected = productVersionKeys.every(key => selectedVersions.includes(key));
        const someProductVersionsSelected = productVersionKeys.some(key => selectedVersions.includes(key));
        
        return (
          <div key={product.id}>
            {versionCount === 1 ? (
              // Single version - show just one button for the product
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  toggleVersion(product.id, "1");
                }}
                onSelect={(e) => e.preventDefault()}
                className="flex items-center justify-between cursor-pointer font-medium"
              >
                {product.name}
                {selectedVersions.includes(`${product.id}:1`) && <Check size={13} className="text-t3" />}
              </DropdownMenuItem>
            ) : (
              // Multiple versions - show product name and version sub-items
              <>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    toggleProduct(product);
                  }}
                  onSelect={(e) => e.preventDefault()}
                  className="flex items-center justify-between cursor-pointer font-medium"
                >
                  {product.name}
                  {allProductVersionsSelected && <Check size={13} className="text-t3" />}
                  {someProductVersionsSelected && !allProductVersionsSelected && (
                    <div className="w-3 h-3 bg-t3 rounded-sm opacity-50" />
                  )}
                </DropdownMenuItem>
                
                {/* Versions */}
                {Array.from({ length: versionCount }, (_, i) => i + 1).map((version) => {
                  const versionKey = `${product.id}:${version}`;
                  const isVersionSelected = selectedVersions.includes(versionKey);
                  
                  return (
                    <DropdownMenuItem
                      key={versionKey}
                      onClick={(e) => {
                        e.preventDefault();
                        toggleVersion(product.id, version.toString());
                      }}
                      onSelect={(e) => e.preventDefault()}
                      className="flex items-center justify-between cursor-pointer ml-4 text-sm text-t2"
                    >
                      v{version}
                      {isVersionSelected && <Check size={13} className="text-t3" />}
                    </DropdownMenuItem>
                  );
                })}
              </>
            )}
          </div>
        );
        })}
      </div>
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
