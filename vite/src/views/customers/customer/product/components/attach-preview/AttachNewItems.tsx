import { PriceItem } from "@/components/pricing/attach-pricing-dialog";
import { getFeatureString } from "@/utils/product/product-item/formatProductItem";
import { useProductContext } from "@/views/products/product/ProductContext";

export const AttachNewItems = () => {
  const { attachState, features } = useProductContext();
  const { preview } = attachState;

  if (preview?.new_items) {
    return (
      <div>
        <p className="text-t2 font-semibold mb-2">New items</p>
        {preview.new_items.map((item: any, index: number) => {
          return (
            <PriceItem key={index}>
              <span>{getFeatureString({ item, features })}</span>
            </PriceItem>
          );
        })}
      </div>
    );
  }
};
