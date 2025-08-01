import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Check } from "lucide-react";
import { useCustomersContext } from "../CustomersContext";
import { Checkbox } from "@/components/ui/checkbox";

export const ProductsSubMenu = () => {
  const { products, versionCounts, filters, setFilters } =
    useCustomersContext();
  const selectedVersions = filters.version
    ? filters.version.split(",").filter(Boolean)
    : [];

  // Deduplicate products by ID (since backend may return multiple entries per product, one per version)
  const uniqueProducts =
    products?.reduce((acc: any[], product: any) => {
      if (!acc.find((p) => p.id === product.id)) {
        acc.push(product);
      }
      return acc;
    }, []) || [];

  // Get all possible product:version combinations
  const getAllProductVersions = () => {
    const productVersions: Array<{
      productId: string;
      version: string;
      key: string;
    }> = [];
    uniqueProducts?.forEach((product: any) => {
      const versionCount = versionCounts?.[product.id] || 1;
      for (let v = 1; v <= versionCount; v++) {
        productVersions.push({
          productId: product.id,
          version: v.toString(),
          key: `${product.id}:${v}`,
        });
      }
    });
    return productVersions;
  };

  const allProductVersions = getAllProductVersions();
  const hasSelections = selectedVersions.length > 0;

  // Calculate unique products that have at least one version selected
  const selectedProductIds = new Set(
    selectedVersions.map((versionKey: string) => versionKey.split(":")[0])
  );
  const selectedProductsCount = selectedProductIds.size;

  const handleSelectAll = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const allSelected =
      allProductVersions.length > 0 &&
      allProductVersions.every((pv) => selectedVersions.includes(pv.key));
    if (allSelected) {
      // Deselect all
      setFilters({
        ...filters,
        product_id: "",
        version: "",
      });
    } else {
      // Select all product:version combinations
      setFilters({
        ...filters,
        product_id: "", // Will be handled by version selections
        version: allProductVersions.map((pv) => pv.key).join(","),
      });
    }
  };

  const toggleProduct = (product: any) => {
    const versionCount = versionCounts?.[product.id] || 1;
    const productVersionKeys = Array.from(
      { length: versionCount },
      (_, i) => `${product.id}:${i + 1}`
    );

    const allProductVersionsSelected = productVersionKeys.every((key) =>
      selectedVersions.includes(key)
    );

    let newSelectedVersions;
    if (allProductVersionsSelected) {
      // Deselect all versions of this product
      newSelectedVersions = selectedVersions.filter(
        (key: string) => !productVersionKeys.includes(key)
      );
    } else {
      // Select all versions of this product
      const toAdd = productVersionKeys.filter(
        (key) => !selectedVersions.includes(key)
      );
      newSelectedVersions = [...selectedVersions, ...toAdd];
    }

    setFilters({
      ...filters,
      product_id: "",
      version: newSelectedVersions.join(","),
    });
  };

  const toggleVersion = (productId: string, version: string) => {
    const versionKey = `${productId}:${version}`;
    const isSelected = selectedVersions.includes(versionKey);

    let newSelectedVersions;
    if (isSelected) {
      newSelectedVersions = selectedVersions.filter(
        (key: string) => key !== versionKey
      );
    } else {
      newSelectedVersions = [...selectedVersions, versionKey];
    }

    setFilters({
      ...filters,
      product_id: "",
      version: newSelectedVersions.join(","),
    });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="flex items-center justify-between cursor-pointer">
        Products
        {hasSelections && (
          <div className="flex items-center h-4 gap-1 p-1 py-0.5 bg-zinc-200 mt-0.5">
            <span className="text-xs text-t3">{selectedProductsCount}</span>
          </div>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-t3 font-regular text-xs">Select products</span>
          <button
            onClick={handleSelectAll}
            className="text-t3 text-xs hover:text-t1 transition-colors cursor-pointer"
          >
            Select all
          </button>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-64 overflow-y-auto">
          {uniqueProducts?.map((product: any) => {
            const versionCount = versionCounts?.[product.id] || 1;
            const productVersionKeys = Array.from(
              { length: versionCount },
              (_, i) => `${product.id}:${i + 1}`
            );
            const allProductVersionsSelected = productVersionKeys.every((key) =>
              selectedVersions.includes(key)
            );
            const someProductVersionsSelected = productVersionKeys.some((key) =>
              selectedVersions.includes(key)
            );

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
                    className="flex items-center gap-2 cursor-pointer font-medium"
                  >
                    <Checkbox
                      checked={selectedVersions.includes(`${product.id}:1`)}
                    />
                    {product.name}
                  </DropdownMenuItem>
                ) : (
                  // Multiple versions - show product name with hover submenu for versions
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger
                      className="flex items-center gap-2 cursor-pointer font-medium"
                      onClick={(e) => {
                        e.preventDefault();
                        toggleProduct(product);
                      }}
                    >
                      <Checkbox
                        checked={allProductVersionsSelected}
                        ref={(ref: any) => {
                          if (
                            ref &&
                            someProductVersionsSelected &&
                            !allProductVersionsSelected
                          ) {
                            ref.indeterminate = true;
                          }
                        }}
                      />
                      {product.name}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.preventDefault();
                          toggleProduct(product);
                        }}
                        onSelect={(e) => e.preventDefault()}
                        className="flex items-center gap-2 cursor-pointer font-medium"
                      >
                        <Checkbox checked={allProductVersionsSelected} />
                        All Versions
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {Array.from(
                        { length: versionCount },
                        (_, i) => i + 1
                      ).map((version) => {
                        const versionKey = `${product.id}:${version}`;
                        const isVersionSelected =
                          selectedVersions.includes(versionKey);

                        return (
                          <DropdownMenuItem
                            key={versionKey}
                            onClick={(e) => {
                              e.preventDefault();
                              toggleVersion(product.id, version.toString());
                            }}
                            onSelect={(e) => e.preventDefault()}
                            className="flex items-center gap-2 cursor-pointer text-sm"
                          >
                            <Checkbox checked={isVersionSelected} />v{version}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
              </div>
            );
          })}
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
