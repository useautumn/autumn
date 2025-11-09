import type { ProductV2 } from "@autumn/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import SmallSpinner from "@/components/general/SmallSpinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/v2/buttons/Button";
import { navigateTo } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";

export function AttachProductDropdown() {
  const { entityId } = useCustomerContext();
  const { products, customer } = useCusQuery();

  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const filteredProducts = products.filter((product: ProductV2) => {
    if (product.archived) return false;

    return product.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleAddProduct = async (productId: string) => {
    navigateTo(
      `/customers/${customer.id || customer.internal_id}/${productId}${
        entityId ? `?entity_id=${entityId}` : ""
      }`,
      navigate
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="primary" size="mini" className="gap-1 font-medium">
          <PlusIcon className="size-3.5" />
          Attach Plan
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-fit max-w-xl whitespace-nowrap truncate max-h-[400px] overflow-y-auto"
        align="end"
      >
        <div className="flex items-center border-b px-2">
          <Search size={12} className="text-t3" />
          <Input
            type="search"
            placeholder="Search plans"
            className="h-7 rounded-none shadow-none border-0 focus:ring-0 focus-visible:ring-0 focus:ring-offset-0 focus:outline-none focus-visible:border-none focus-visible:shadow-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            autoFocus
          />
        </div>
        {filteredProducts.length === 0 ? (
          <div className="py-2 px-3 text-sm text-t3">No new products found</div>
        ) : (
          filteredProducts.map((product: ProductV2) => (
            <DropdownProductItem
              key={product.id}
              product={product}
              handleAddProduct={handleAddProduct}
            />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const DropdownProductItem = ({
  product,
  handleAddProduct,
}: {
  product: ProductV2;
  handleAddProduct: (productId: string) => Promise<void>;
}) => {
  const [isLoading, setIsLoading] = useState(false);
  return (
    <DropdownMenuItem
      key={product.id}
      onClick={async (e) => {
        e.stopPropagation();
        e.preventDefault();
        setIsLoading(true);
        await handleAddProduct(product.id);
      }}
    >
      {isLoading && <SmallSpinner />}
      <div className="flex items-center gap-2">
        <span>{product.name}</span>
        <span className="text-t3">({product.id})</span>
      </div>
    </DropdownMenuItem>
  );
};
