import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import React, { useState } from "react";
import { useCustomerContext } from "../CustomerContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import toast from "react-hot-toast";
import CopyButton from "@/components/general/CopyButton";
import Link from "next/link";
import PriceOptions from "../add-product/ConfigurePriceOptions";
import { CusService } from "@/services/customers/CusService";
import { getBackendErr } from "@/utils/genUtils";
import { AddProductContext } from "../add-product/CreateCheckoutContext";

export const ManageEntitlements = () => {
  const { products, customer, env } = useCustomerContext();
  const axiosInstance = useAxiosInstance({ env });
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [options, setOptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

   const handleCreateCheckout = async () => {
    setIsLoading(true);

    console.log("options", options);
    const priceOptions = [...options].filter(
      (item) => Object.keys(item.options).length > 0
    );

    try {
      const { data } = await CusService.addProduct(axiosInstance, customer.id, {
        product_id: selectedProduct.id,
        price_options: priceOptions,
      });

      if (data.checkout_url) {
        setUrl(data.checkout_url);
      }
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to add product to customer"));
    }

    setIsLoading(false);
  };

  return (
    <AddProductContext.Provider
      value={{ options, setOptions, selectedProduct }}
    >
      <Dialog>
        <DialogTrigger asChild>
          <Button className="w-full" variant="dashed" size="sm">Manage Entitlements</Button>
        </DialogTrigger>
        <DialogContent className="w-full flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Entitlements</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
              <Select
                value={selectedProduct?.id}
                onValueChange={(value) => {
                  const product = products.find((p) => p.id === value)!;
                  setSelectedProduct(product);
                  setOptions(
                    product.prices.map((price: any) => ({
                      id: price.id,
                      options: {},
                    }))
                  );
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProduct && <PriceOptions />}
            </div>
          <DialogFooter>
            {url ? (
              <CopyButton
                className="!w-fit p-3 py-4"
                variant="default"
                text={url}
              >
                Copy
              </CopyButton>
            ) : (
              <Button onClick={handleCreateCheckout} isLoading={isLoading}>
                Create Checkout
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AddProductContext.Provider>
  );
}


