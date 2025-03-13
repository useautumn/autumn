import React from "react";
import { useAddProductContext } from "./CreateCheckoutContext";
import { PriceType } from "@autumn/shared";
import { Button } from "@/components/ui/button";
import { ProductPricingTable } from "@/views/products/product/prices/ProductPricingTable";

function ConfigureAddProduct() {
  const { selectedProduct } = useAddProductContext();

  return (
    <div>
      <p>Prices</p>
      {selectedProduct && (
        <div className="flex flex-col gap-2">
          <p>Prices</p>
          <ProductPricingTable prices={selectedProduct?.prices} />
        </div>
      )}
      <Button>Add new price</Button>
    </div>
  );
}

export default ConfigureAddProduct;
