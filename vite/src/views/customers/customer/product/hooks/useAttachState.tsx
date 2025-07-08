import { isFeatureItem } from "@/utils/product/getItemType";
import { isOneOffProduct } from "@/utils/product/priceUtils";
import { sortProductItems } from "@/utils/productUtils";
import {
  AttachPreview,
  FeatureOptions,
  ProductItem,
  ProductV2,
  UsageModel,
} from "@autumn/shared";
import { useEffect, useState } from "react";

export type FrontendProduct = ProductV2 & {
  isActive: boolean;
  options: FeatureOptions[];
  isCanceled: boolean;
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
  initialProductRef,
}: {
  product: FrontendProduct | null;
  setProduct: (product: FrontendProduct) => void;
  initialProductRef: React.RefObject<FrontendProduct | null>;
}) => {
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
    isCanceled: product ? product.isCanceled : false,
    isOneOff: product
      ? isOneOffProduct(product.items, product.is_add_on)
      : false,
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
      isCanceled: product ? product.isCanceled : false,
      isOneOff: product
        ? isOneOffProduct(product.items, product.is_add_on)
        : false,
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

    const hasItemsChanged =
      JSON.stringify({
        items: sortedProduct.items,
        free_trial: sortedProduct.free_trial,
      }) !==
      JSON.stringify({
        items: initialProductRef.current?.items || [],
        free_trial: initialProductRef.current?.free_trial || null,
      });

    setItemsChanged(hasItemsChanged);
  }, [product]);

  const getButtonDisabled = () => {
    if (product?.isActive && !itemsChanged && !flags.isCanceled) {
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
  };

  const getButtonText = () => {
    if (product?.isActive && !itemsChanged) {
      if (flags.isOneOff) {
        return "Attach Product";
      }

      if (flags.hasPrepaid) {
        return "Update prepaid quantity";
      }
    }

    if (flags.isCanceled) {
      return "Renew Product";
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
