import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { handleAutoSave } from "../model-pricing-utils/modelPricingUtils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useModelPricingContext } from "../ModelPricingContext";
import { slugify } from "@/utils/formatUtils/formatTextUtils";

export const EditProductDetails = () => {
  const {
    editingNewProduct,
    productDataState: { product, setProduct },
    mutate,
  } = useModelPricingContext();

  const axiosInstance = useAxiosInstance();
  const [details, setDetails] = useState({
    name: product?.name,
    id: product?.id,
  });

  useEffect(() => {
    if (product.id) {
      setDetails({
        name: product.name,
        id: product.id,
      });
    }
  }, [product]);

  return (
    <div className="flex gap-2 items-center">
      <div>
        <FieldLabel className="text-t2 font-medium">Name</FieldLabel>
        <Input
          onBlur={async () => {
            await handleAutoSave({
              axiosInstance,
              productId: product.id ? product.id : details.id,
              product: {
                ...product,
                name: details.name,
                id: details.id,
              },
              mutate,
            });
            setProduct({
              ...product,
              name: details.name,
              id: details.id,
            });
          }}
          placeholder="Eg. Free Plan"
          value={details.name}
          onChange={(e) => {
            const newIdData = editingNewProduct
              ? {
                  id: slugify(e.target.value),
                }
              : {};
            setDetails({
              ...details,
              name: e.target.value,
              ...newIdData,
            });
          }}
        />
      </div>
      <div>
        <FieldLabel className="text-t2 font-medium">ID</FieldLabel>
        <Input value={details.id} disabled={true} placeholder="Eg. free_plan" />
      </div>
    </div>
  );
};
