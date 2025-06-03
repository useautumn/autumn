import { isFeatureItem } from "@/utils/product/getItemType";
import { isOneOffProduct } from "@/utils/product/priceUtils";
import { sortProductItems } from "@/utils/productUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import {
  AttachPreview,
  AttachScenario,
  BillingInterval,
  CheckProductPreview,
  FeatureOptions,
  ProductItem,
  ProductV2,
  UsageModel,
} from "@autumn/shared";
import { useEffect, useRef, useState } from "react";

type FrontendProduct = ProductV2 & {
  isActive: boolean;
  options: FeatureOptions[];
};

export enum AttachCase {
  AddOn = "Add On",
  OneOff = "One Off",
  Active = "Active",
  Custom = "Custom",
  Checkout = "Checkout",
}

const productHasPrepaid = (items: ProductItem[]) => {
  return items.some((item) => item.usage_model == UsageModel.Prepaid);
};

const productIsAddOn = (product: FrontendProduct) => {
  return product.is_add_on;
};

const productIsFree = (product: FrontendProduct) => {
  return product.items.every((item) => isFeatureItem(item));
};

export const useAttachState = ({
  product,
  setProduct,
}: {
  product: FrontendProduct | null;
  setProduct: (product: FrontendProduct) => void;
}) => {
  const initialProductRef = useRef<FrontendProduct | null>(null);
  const [preview, setPreview] = useState<AttachPreview | null>(null);
  const [options, setOptions] = useState<
    (FeatureOptions & {
      full_price: number;
      billing_units: number;
    })[]
  >([]);
  const [itemsChanged, setItemsChanged] = useState(false);
  const [flags, setFlags] = useState({
    hasPrepaid: product ? productHasPrepaid(product.items) : false,
    isAddOn: product ? productIsAddOn(product) : false,
    isFree: product ? productIsFree(product) : false,
  });

  useEffect(() => {
    if (preview?.options) {
      setOptions(preview.options);
    }
  }, [preview]);

  const initFlags = () => {
    setFlags({
      hasPrepaid: product ? productHasPrepaid(product.items) : false,
      isAddOn: product ? productIsAddOn(product) : false,
      isFree: product ? productIsFree(product) : false,
    });
  };

  useEffect(() => {
    if (!product) {
      return;
    }

    const sortedProduct = {
      ...product,
      items: sortProductItems(product.items),
    };

    if (JSON.stringify(product.items) !== JSON.stringify(sortedProduct.items)) {
      setProduct(sortedProduct);
    }

    initFlags();

    if (!initialProductRef.current) {
      initialProductRef.current = structuredClone(sortedProduct);
      setItemsChanged(false);
      return;
    }

    const hasItemsChanged =
      JSON.stringify(sortedProduct.items) !==
      JSON.stringify(initialProductRef.current.items);

    setItemsChanged(hasItemsChanged);
  }, [product]);

  const getButtonDisabled = () => {
    if (product?.isActive && !itemsChanged) {
      if (flags.hasPrepaid) {
        return false;
      }

      if (flags.isAddOn) {
        return false;
      }

      return true;
    }

    return false;
  };

  const getAttachCase = () => {
    if (!product) {
      return null;
    }

    if (product?.is_add_on) {
      return AttachCase.AddOn;
    }

    if (isOneOffProduct(product.items, product.is_add_on)) {
      return AttachCase.OneOff;
    }

    if (product?.isActive && !itemsChanged) {
      return AttachCase.Active;
    }

    if (itemsChanged) {
      return AttachCase.Custom;
    }

    // if (!preview || !preview.payment_method) {
    //   return AttachCase.Checkout;
    // }

    // return preview.scenario;
  };

  const getButtonText = () => {
    if (product?.isActive && !itemsChanged) {
      if (flags.hasPrepaid) {
        return "Update prepaid quantity";
      }
    }

    return "Attach Product";
  };

  return {
    itemsChanged,
    buttonDisabled: getButtonDisabled(),
    buttonText: getButtonText(),
    attachCase: getAttachCase(),

    preview,
    setPreview,
    options,
    setOptions,

    flags,
    setFlags,
  };
};
