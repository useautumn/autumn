import { useAxiosSWR } from "@/services/useAxiosSwr";
import { sortProductItems } from "@/utils/productUtils";
import { AppEnv, Feature, ProductItem, ProductV2 } from "@autumn/shared";
import { useEffect, useRef, useState } from "react";

export const useProductData = ({
  originalProduct,
  originalFeatures,
}: {
  originalProduct: ProductV2 | null;
  originalFeatures: Feature[] | null;
}) => {
  const initialProductRef = useRef<ProductV2 | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [product, setProduct] = useState<ProductV2 | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [entityFeatureIds, setEntityFeatureIds] = useState<string[]>([]);

  const initEntityFeatureIds = (product: ProductV2 | null) => {
    if (!product) return [];
    return Array.from(
      new Set(
        product.items
          .filter((item: ProductItem) => item.entity_feature_id != null)
          .map((item: ProductItem) => item.entity_feature_id!)
      )
    );
  };

  useEffect(() => {
    if (originalProduct) {
      const sortedProduct = {
        ...originalProduct,
        items: sortProductItems(originalProduct.items),
      };

      initialProductRef.current = structuredClone(sortedProduct);
      setEntityFeatureIds(initEntityFeatureIds(sortedProduct));
      setProduct(sortedProduct);
    }

    if (originalFeatures) {
      setFeatures(originalFeatures);
    }
  }, [originalProduct, originalFeatures]);

  useEffect(() => {
    if (!product) return;

    const sortedProduct = {
      ...product,
      items: sortProductItems(product.items),
    };

    if (JSON.stringify(product.items) !== JSON.stringify(sortedProduct.items)) {
      setProduct(sortedProduct);
    }

    const originalProduct = initialProductRef.current;

    if (!originalProduct || !sortedProduct) {
      setHasChanges(false);
      return;
    }

    const hasChanged =
      JSON.stringify(sortedProduct) !== JSON.stringify(originalProduct);

    setHasChanges(hasChanged);
  }, [product]);

  const isNewProduct =
    initialProductRef.current?.items?.length === 0 &&
    !initialProductRef.current?.free_trial;

  const actionState = {
    disabled: !hasChanges,
    buttonText: isNewProduct ? "Create Product" : "Update Product",
    tooltipText: !hasChanges
      ? isNewProduct
        ? "Add entitlements and prices to create a new product"
        : `Make a change to the entitlements or prices to update ${product?.name}`
      : isNewProduct
        ? `Create a new product: ${product?.name} `
        : `Save changes to product: ${product?.name}`,
  };

  return {
    product,
    setProduct,
    hasChanges,
    features,
    setFeatures,
    entityFeatureIds,
    setEntityFeatureIds,
    actionState,
    isNewProduct,
  };
};
