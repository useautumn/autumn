import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import React, { useState } from "react";
import { useCustomerContext } from "../CustomerContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { AddProductContext } from "./CreateCheckoutContext";
import { Input } from "@/components/ui/input";

import { faSearch } from "@fortawesome/pro-solid-svg-icons";
import { useNavigate } from "react-router";
import { getRedirectUrl, navigateTo } from "@/utils/genUtils";
import { toast } from "sonner";
import { OrgService } from "@/services/OrgService";
import { Product } from "@autumn/shared";
import SmallSpinner from "@/components/general/SmallSpinner";
import { Search } from "lucide-react";

function AddProduct() {
  const { products, customer, env, org } = useCustomerContext();
  const axiosInstance = useAxiosInstance({ env });
  const [options, setOptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filteredProducts = products.filter((product: Product) => {
    if (product.is_add_on && !searchQuery) return true;

    return (
      !customer.products?.some(
        (cp: any) =>
          cp.product_id === product.id &&
          !product.is_add_on &&
          cp.status === "active"
      ) && product.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const navigate = useNavigate();

  const handleAddProduct = async (productId: string, setLoading: any) => {
    // Check org

    // 1. Get org from backend
    const { data } = await OrgService.get(axiosInstance);

    if (!data.org) {
      toast.error("Something went wrong...please try again later");
      setLoading(false);
      return;
    }

    if (!data.org.stripe_connected) {
      toast.error("Connect to Stripe to add products to customers");
      const redirectUrl = getRedirectUrl(`/customers/${customer.id}`, env);
      navigateTo(`/integrations/stripe?redirect=${redirectUrl}`, navigate, env);
      return;
    }

    navigateTo(
      `/customers/${customer.id || customer.internal_id}/${productId}`,
      navigate,
      env
    );
  };

  return (
    <AddProductContext.Provider value={{ options, setOptions }}>
      <div className="relative w-full">
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="add">Attach Product</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            // className="w-[var(--radix-dropdown-menu-trigger-width)] p-0"
            className="w-fit max-w-xl whitespace-nowrap truncate "
            align="end"
          >
            <div className="flex items-center border-b px-2">
              <Search size={12} className="text-t3" />
              <Input
                type="search"
                placeholder="Search products"
                className="h-7 rounded-none shadow-none border-0 focus:ring-0 focus-visible:ring-0 focus:ring-offset-0 focus:outline-none focus-visible:border-none focus-visible:shadow-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                autoFocus
              />
            </div>
            {filteredProducts.length === 0 ? (
              <div className="py-2 px-3 text-sm text-t3">
                No new products found
              </div>
            ) : (
              filteredProducts.map((product: Product) => (
                <DropdownProductItem
                  key={product.id}
                  product={product}
                  handleAddProduct={handleAddProduct}
                />
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </AddProductContext.Provider>
  );
}

export default AddProduct;

const DropdownProductItem = ({
  product,
  handleAddProduct,
}: {
  product: Product;
  handleAddProduct: any;
}) => {
  const [isLoading, setIsLoading] = useState(false);
  return (
    <DropdownMenuItem
      key={product.id}
      onClick={async (e) => {
        e.stopPropagation();
        e.preventDefault();
        setIsLoading(true);
        await handleAddProduct(product.id, setIsLoading);
        // setIsLoading(false);
      }}
    >
      {isLoading && <SmallSpinner />}
      {product.name}
    </DropdownMenuItem>
  );
};
